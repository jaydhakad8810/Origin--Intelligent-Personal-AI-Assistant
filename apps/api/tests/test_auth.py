import uuid
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.auth import COOKIE_NAME, get_current_user
from app.db import get_db
from app.main import app


def fake_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "a@example.com"
    user.name = "Ann"
    user.picture = "https://example.com/a.png"
    return user


def make_client(db):
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_me_401_without_cookie():
    response = make_client(MagicMock()).get("/v1/auth/me")
    assert response.status_code == 401


def test_me_200_with_valid_session():
    user = fake_user()
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = user
    client = make_client(db)
    client.cookies.set(COOKIE_NAME, "some-token")
    response = client.get("/v1/auth/me")
    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "email": "a@example.com",
        "name": "Ann",
        "picture": "https://example.com/a.png",
    }


def test_me_401_with_unknown_session():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = None
    client = make_client(db)
    client.cookies.set(COOKIE_NAME, "bad-token")
    assert client.get("/v1/auth/me").status_code == 401


def test_logout_deletes_session_and_clears_cookie():
    db = MagicMock()
    client = make_client(db)
    client.cookies.set(COOKIE_NAME, "some-token")
    response = client.post("/v1/auth/logout")
    assert response.status_code == 204
    db.execute.assert_called_once()
    db.commit.assert_called_once()
    assert COOKIE_NAME in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_chat_401_anonymous():
    response = make_client(MagicMock()).post("/v1/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_chat_200_authenticated():
    app.dependency_overrides[get_current_user] = fake_user
    response = TestClient(app).post("/v1/chat", json={"message": "hi"})
    assert response.status_code == 200
    assert "reply" in response.json()


def test_login_503_when_not_configured(monkeypatch):
    from app import config

    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", None)
    response = make_client(MagicMock()).get(
        "/v1/auth/google/login", follow_redirects=False
    )
    assert response.status_code == 503
