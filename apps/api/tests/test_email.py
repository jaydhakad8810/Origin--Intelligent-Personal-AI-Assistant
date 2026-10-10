import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import config
from app.auth import get_current_user
from app.db import get_db
from app.llm import limiter
from app.llm.base import LLMProvider
from app.main import app
from app.models import Conversation, Message, Note, User

client = TestClient(app)
URL = "/v1/email/polish"


class Fake(LLMProvider):
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def generate(self, messages, system=None):
        self.calls.append((messages, system))
        return self.reply


def use_provider(monkeypatch, provider):
    monkeypatch.setattr("app.email.get_provider", lambda: provider)
    return provider


@pytest.fixture(autouse=True)
def clean_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def signed_in(sqlite_session):
    user = User(email="a@example.com")
    sqlite_session.add(user)
    sqlite_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: sqlite_session
    yield user
    app.dependency_overrides.clear()


def test_requires_login():
    assert client.post(URL, json={"text": "hi"}).status_code == 401


@pytest.mark.parametrize("text", ["", "   \n "])
def test_empty_text_422(signed_in, text):
    assert client.post(URL, json={"text": text}).status_code == 422


def test_too_long_422(signed_in):
    assert client.post(URL, json={"text": "a" * 5001}).status_code == 422


def test_bad_tone_422(signed_in):
    r = client.post(URL, json={"text": "hi", "tone": "angry"})
    assert r.status_code == 422


def test_success_parses_subject_and_body(signed_in, monkeypatch):
    fake = use_provider(
        monkeypatch, Fake("Subject: Meeting request\n\nHello [Name],\n\nCan we meet?")
    )
    r = client.post(URL, json={"text": "  can we meet  ", "tone": "formal"})
    assert r.status_code == 200
    assert r.json() == {
        "subject": "Meeting request",
        "body": "Hello [Name],\n\nCan we meet?",
    }
    messages, system = fake.calls[0]
    assert messages == [{"role": "user", "content": "can we meet"}]  # trimmed
    assert "formal" in system


def test_default_tone_is_professional(signed_in, monkeypatch):
    fake = use_provider(monkeypatch, Fake("Subject: Hi\n\nBody"))
    assert client.post(URL, json={"text": "hi"}).status_code == 200
    assert "professional" in fake.calls[0][1]


def test_reply_without_subject_gives_empty_subject(signed_in, monkeypatch):
    use_provider(monkeypatch, Fake("Just a body.\nSecond line."))
    r = client.post(URL, json={"text": "hi"})
    assert r.status_code == 200
    assert r.json() == {"subject": "", "body": "Just a body.\nSecond line."}


def test_limiter_counts(signed_in, monkeypatch):
    use_provider(monkeypatch, Fake("Subject: A\n\nB"))
    monkeypatch.setattr(config, "LLM_DAILY_LIMIT", 1)
    assert client.post(URL, json={"text": "hi"}).status_code == 200
    r = client.post(URL, json={"text": "again"})
    assert r.status_code == 429
    assert "limit" in r.json()["detail"]


def test_provider_error_502_no_secret(signed_in, monkeypatch):
    class Broken(LLMProvider):
        def generate(self, messages, system=None):
            raise RuntimeError("secret-key-123 boom")

    use_provider(monkeypatch, Broken())
    r = client.post(URL, json={"text": "hi"})
    assert r.status_code == 502
    assert "secret-key-123" not in r.text
    assert "unavailable" in r.json()["detail"]


def test_nothing_written_to_db(signed_in, sqlite_session, monkeypatch):
    use_provider(monkeypatch, Fake("Subject: A\n\nB"))
    assert client.post(URL, json={"text": "secret mail"}).status_code == 200
    for model in (Conversation, Message, Note):
        count = sqlite_session.execute(select(func.count()).select_from(model)).scalar()
        assert count == 0
