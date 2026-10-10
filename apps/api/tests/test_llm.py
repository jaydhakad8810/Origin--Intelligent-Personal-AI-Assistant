import pytest
from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.db import get_db
from app.llm import limiter
from app.llm.base import LLMError, LLMProvider
from app.llm.demo import DemoProvider
from app.llm.factory import get_provider
from app.main import app
from app.models import User

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_limiter():
    limiter.reset()
    yield
    limiter.reset()


def test_factory_default_is_demo(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "demo")
    assert isinstance(get_provider(), DemoProvider)


def test_factory_unknown_provider_errors(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "nope")
    with pytest.raises(LLMError, match="nope"):
        get_provider()


def test_limiter_blocks_after_limit(monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 2)
    limiter.check_and_count("u1")
    limiter.check_and_count("u1")
    with pytest.raises(limiter.DailyLimitExceeded):
        limiter.check_and_count("u1")
    limiter.check_and_count("u2")  # other users are unaffected


@pytest.fixture
def signed_in(sqlite_session):
    user = User(email="a@example.com")
    sqlite_session.add(user)
    sqlite_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: sqlite_session
    yield user
    app.dependency_overrides.clear()


def test_chat_returns_429_over_limit(signed_in, monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 1)
    assert client.post("/v1/chat", json={"message": "hi"}).status_code == 200
    response = client.post("/v1/chat", json={"message": "again"})
    assert response.status_code == 429
    assert "limit" in response.json()["detail"]


def test_chat_provider_error_is_friendly(signed_in, monkeypatch):
    class Broken(LLMProvider):
        def generate(self, messages, system=None):
            raise RuntimeError("secret-key-123 boom")

    monkeypatch.setattr("app.conversations.get_provider", lambda: Broken())
    response = client.post("/v1/chat", json={"message": "hi"})
    assert response.status_code == 502
    assert "secret-key-123" not in response.text
    assert "unavailable" in response.json()["detail"]
