import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import User

client = TestClient(app)


@pytest.fixture(autouse=True)
def signed_in(sqlite_session):
    user = User(email="a@example.com")
    sqlite_session.add(user)
    sqlite_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: sqlite_session
    yield
    app.dependency_overrides.clear()


def test_chat_ok():
    response = client.post("/v1/chat", json={"message": "hi"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == (
        'Demo mode. You said: "hi". Real answers arrive once the AI is connected.'
    )
    assert body["conversation_id"]


def test_chat_empty_message():
    response = client.post("/v1/chat", json={"message": ""})
    assert response.status_code == 422


def test_chat_message_too_long():
    response = client.post("/v1/chat", json={"message": "a" * 2001})
    assert response.status_code == 422
