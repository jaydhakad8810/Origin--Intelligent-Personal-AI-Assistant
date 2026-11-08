from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import config
from app.auth import get_current_user
from app.db import get_db
from app.llm import limiter
from app.llm.base import LLMError, LLMProvider
from app.llm.demo import DemoProvider
from app.llm.factory import get_provider
from app.main import app
from app.models import Base, LlmUsage, User

client = TestClient(app)


def test_factory_default_is_demo(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "demo")
    assert isinstance(get_provider(), DemoProvider)


def test_factory_unknown_provider_errors(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "nope")
    with pytest.raises(LLMError, match="nope"):
        get_provider()


def _make_user(session, email):
    user = User(email=email)
    session.add(user)
    session.commit()
    return user


def test_limiter_blocks_after_limit_and_is_per_user(sqlite_session, monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 2)
    u1 = _make_user(sqlite_session, "u1@example.com")
    u2 = _make_user(sqlite_session, "u2@example.com")
    limiter.check_and_count(sqlite_session, u1.id)
    limiter.check_and_count(sqlite_session, u1.id)
    with pytest.raises(limiter.DailyLimitExceeded):
        limiter.check_and_count(sqlite_session, u1.id)
    limiter.check_and_count(sqlite_session, u2.id)  # other users are unaffected
    # A blocked call is not counted.
    count = sqlite_session.execute(
        select(LlmUsage.count).where(LlmUsage.user_id == u1.id)
    ).scalar()
    assert count == 2


def test_limiter_survives_new_app_instance(tmp_path, monkeypatch):
    """The count lives in the database, not in memory."""
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 1)
    url = f"sqlite:///{tmp_path / 'usage.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as first:
        user_id = _make_user(first, "a@example.com").id
        limiter.check_and_count(first, user_id)
    engine.dispose()

    # Brand-new engine and session, as after a restart.
    engine2 = create_engine(url)
    with sessionmaker(bind=engine2)() as second:
        with pytest.raises(limiter.DailyLimitExceeded):
            limiter.check_and_count(second, user_id)
    engine2.dispose()


def test_limiter_resets_on_new_utc_day(sqlite_session, monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 1)
    user = _make_user(sqlite_session, "a@example.com")
    monkeypatch.setattr(limiter, "_today", lambda: date(2026, 1, 1))
    limiter.check_and_count(sqlite_session, user.id)
    with pytest.raises(limiter.DailyLimitExceeded):
        limiter.check_and_count(sqlite_session, user.id)
    monkeypatch.setattr(limiter, "_today", lambda: date(2026, 1, 2))
    limiter.check_and_count(sqlite_session, user.id)  # new day, allowed again


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
