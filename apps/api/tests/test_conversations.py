import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import Conversation, Message, User


@pytest.fixture
def env(sqlite_session):
    a, b = User(email="a@example.com"), User(email="b@example.com")
    sqlite_session.add_all([a, b])
    sqlite_session.commit()
    current = {"user": a}
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    app.dependency_overrides[get_db] = lambda: sqlite_session
    yield sqlite_session, a, b, current
    app.dependency_overrides.clear()


client = TestClient(app)


def as_user(current, user):
    current["user"] = user


def b_conversation(env):
    db, a, b, current = env
    as_user(current, b)
    cid = client.post("/v1/chat", json={"message": "secret from B"}).json()[
        "conversation_id"
    ]
    as_user(current, a)
    return cid


def test_unauthenticated_gets_401():
    app.dependency_overrides.clear()
    from unittest.mock import MagicMock

    app.dependency_overrides[get_db] = lambda: MagicMock()
    cid = uuid.uuid4()
    assert client.get("/v1/conversations").status_code == 401
    assert client.get(f"/v1/conversations/{cid}/messages").status_code == 401
    assert client.delete(f"/v1/conversations/{cid}").status_code == 401
    assert client.post("/v1/chat", json={"message": "hi"}).status_code == 401
    app.dependency_overrides.clear()


def test_chat_creates_conversation_and_saves_both_messages(env):
    db, a, b, current = env
    message = "x" * 100
    data = client.post("/v1/chat", json={"message": message}).json()
    conv = db.get(Conversation, uuid.UUID(data["conversation_id"]))
    assert conv.title == "x" * 40
    rows = client.get(f"/v1/conversations/{conv.id}/messages").json()
    assert [r["role"] for r in rows] == ["user", "assistant"]
    assert rows[0]["content"] == message
    assert rows[1]["content"] == data["reply"]


def test_chat_continues_existing_conversation(env):
    first = client.post("/v1/chat", json={"message": "one"}).json()
    second = client.post(
        "/v1/chat",
        json={"message": "two", "conversation_id": first["conversation_id"]},
    ).json()
    assert second["conversation_id"] == first["conversation_id"]
    rows = client.get(
        f"/v1/conversations/{first['conversation_id']}/messages"
    ).json()
    assert [r["role"] for r in rows] == ["user", "assistant", "user", "assistant"]
    assert rows[2]["content"] == "two"


def test_list_only_own_conversations_latest_first(env):
    b_conversation(env)
    first = client.post("/v1/chat", json={"message": "older"}).json()
    client.post("/v1/chat", json={"message": "newer"})
    listing = client.get("/v1/conversations").json()
    assert [c["title"] for c in listing] == ["newer", "older"]
    assert set(listing[0]) == {"id", "title", "updated_at"}
    assert first["conversation_id"] in [c["id"] for c in listing]


def test_user_a_cannot_list_read_post_or_delete_b_conversation(env):
    db = env[0]
    cid = b_conversation(env)
    # list: B's conversation is not in A's list
    assert cid not in [c["id"] for c in client.get("/v1/conversations").json()]
    # read
    assert client.get(f"/v1/conversations/{cid}/messages").status_code == 404
    # post
    r = client.post("/v1/chat", json={"message": "hi", "conversation_id": cid})
    assert r.status_code == 404
    # delete
    assert client.delete(f"/v1/conversations/{cid}").status_code == 404
    # B's data is untouched
    assert db.get(Conversation, uuid.UUID(cid)) is not None
    count = db.scalar(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == uuid.UUID(cid)
        )
    )
    assert count == 2


def test_unknown_conversation_id_is_404(env):
    cid = uuid.uuid4()
    assert client.get(f"/v1/conversations/{cid}/messages").status_code == 404
    assert client.delete(f"/v1/conversations/{cid}").status_code == 404
    r = client.post("/v1/chat", json={"message": "hi", "conversation_id": str(cid)})
    assert r.status_code == 404


def test_delete_cascades_messages(env):
    db = env[0]
    cid = client.post("/v1/chat", json={"message": "bye"}).json()["conversation_id"]
    assert client.delete(f"/v1/conversations/{cid}").status_code == 204
    assert db.get(Conversation, uuid.UUID(cid)) is None
    left = db.scalar(select(func.count()).select_from(Message))
    assert left == 0


def test_database_cascade_removes_messages_when_conversation_deleted(env):
    """The foreign key itself cascades (not only our explicit delete)."""
    db = env[0]
    cid = uuid.UUID(
        client.post("/v1/chat", json={"message": "x"}).json()["conversation_id"]
    )
    db.expire_all()
    db.delete(db.get(Conversation, cid))
    db.commit()
    assert db.scalar(select(func.count()).select_from(Message)) == 0
