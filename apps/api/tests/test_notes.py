import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import User


@pytest.fixture
def env(sqlite_session):
    a, b = User(email="a@example.com"), User(email="b@example.com")
    sqlite_session.add_all([a, b])
    sqlite_session.commit()
    current = {"user": a}
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    app.dependency_overrides[get_db] = lambda: sqlite_session
    yield a, b, current
    app.dependency_overrides.clear()


client = TestClient(app)


def test_no_cookie_gets_401():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    nid = uuid.uuid4()
    assert client.get("/v1/notes").status_code == 401
    assert client.post("/v1/notes", json={"title": "x"}).status_code == 401
    assert client.patch(f"/v1/notes/{nid}", json={"title": "x"}).status_code == 401
    assert client.delete(f"/v1/notes/{nid}").status_code == 401
    app.dependency_overrides.clear()


def test_create_list_update_delete(env):
    res = client.post("/v1/notes", json={"title": "  Milk  ", "content": "2 litres"})
    assert res.status_code == 201
    note = res.json()
    assert note["title"] == "Milk"  # trimmed
    assert note["content"] == "2 litres"

    client.post("/v1/notes", json={"title": "Second"})
    titles = [n["title"] for n in client.get("/v1/notes").json()]
    assert titles == ["Second", "Milk"]  # newest first

    res = client.patch(f"/v1/notes/{note['id']}", json={"content": "3 litres"})
    assert res.status_code == 200
    assert res.json()["content"] == "3 litres"
    assert res.json()["title"] == "Milk"

    assert client.delete(f"/v1/notes/{note['id']}").status_code == 204
    assert [n["title"] for n in client.get("/v1/notes").json()] == ["Second"]


def test_content_only_note_is_allowed(env):
    res = client.post("/v1/notes", json={"content": "just text"})
    assert res.status_code == 201
    assert res.json()["title"] == ""


def test_foreign_user_gets_404_and_cannot_see_note(env):
    a, b, current = env
    nid = client.post("/v1/notes", json={"title": "A's secret"}).json()["id"]

    current["user"] = b
    assert client.get("/v1/notes").json() == []
    assert client.patch(f"/v1/notes/{nid}", json={"title": "hacked"}).status_code == 404
    assert client.delete(f"/v1/notes/{nid}").status_code == 404

    current["user"] = a
    assert client.get("/v1/notes").json()[0]["title"] == "A's secret"


def test_missing_note_is_404(env):
    nid = uuid.uuid4()
    assert client.patch(f"/v1/notes/{nid}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/v1/notes/{nid}").status_code == 404


def test_too_long_input_gives_422(env):
    assert client.post("/v1/notes", json={"title": "x" * 201}).status_code == 422
    assert client.post("/v1/notes", json={"content": "x" * 10001}).status_code == 422
    nid = client.post("/v1/notes", json={"title": "ok"}).json()["id"]
    assert client.patch(f"/v1/notes/{nid}", json={"title": "x" * 201}).status_code == 422
    assert client.patch(f"/v1/notes/{nid}", json={"content": "x" * 10001}).status_code == 422
    # Exactly at the limit is fine.
    assert client.post("/v1/notes", json={"content": "x" * 10000}).status_code == 201


def test_empty_note_gives_clear_422(env):
    for body in ({}, {"title": "", "content": ""}, {"title": "   ", "content": "  \n "}):
        res = client.post("/v1/notes", json=body)
        assert res.status_code == 422
        assert res.json()["detail"] == "A note needs a title or some text."

    nid = client.post("/v1/notes", json={"title": "ok"}).json()["id"]
    res = client.patch(f"/v1/notes/{nid}", json={"title": "  "})
    assert res.status_code == 422
    assert res.json()["detail"] == "A note needs a title or some text."
