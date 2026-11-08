import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import MagicMock

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import calendar as gcal
from app import config, crypto
from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import GoogleConnection, User

SCOPE = gcal.SCOPE
calls: list[httpx.Request] = []


@pytest.fixture
def env(sqlite_session, monkeypatch):
    monkeypatch.setattr(config, "TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setattr(config, "GOOGLE_CLIENT_SECRET", "csecret")
    a, b = User(email="a@example.com"), User(email="b@example.com")
    sqlite_session.add_all([a, b])
    sqlite_session.commit()
    current = {"user": a}
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    app.dependency_overrides[get_db] = lambda: sqlite_session

    calls.clear()
    responses: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        url = str(request.url)
        if url.startswith(gcal.TOKEN_URL):
            return responses["token"]
        if url.startswith(gcal.EVENTS_URL):
            return responses["events"]
        if url.startswith(gcal.REVOKE_URL):
            return httpx.Response(200)
        return httpx.Response(404)

    monkeypatch.setattr(
        gcal, "_http", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    yield a, b, current, responses, sqlite_session
    app.dependency_overrides.clear()


def _client():
    return TestClient(app, follow_redirects=False)


def _connect_row(session, user, access="AT", refresh="RT", expires_in=3600):
    session.add(
        GoogleConnection(
            user_id=user.id,
            scopes=SCOPE,
            refresh_token_encrypted=crypto.encrypt(refresh),
            access_token_encrypted=crypto.encrypt(access),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
        )
    )
    session.commit()


def test_encryption_roundtrip(env):
    token = "ya29.secret-token"
    enc = crypto.encrypt(token)
    assert enc != token and token not in enc
    assert crypto.decrypt(enc) == token


def test_missing_key_fails_clearly(monkeypatch):
    monkeypatch.setattr(config, "TOKEN_ENCRYPTION_KEY", None)
    with pytest.raises(crypto.CryptoError, match="TOKEN_ENCRYPTION_KEY"):
        crypto.encrypt("x")


def test_logged_out_gets_401():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    c = _client()
    assert c.get("/v1/google/calendar/connect").status_code == 401
    assert c.get("/v1/google/calendar/callback?code=x&state=y").status_code == 401
    assert c.get("/v1/calendar/status").status_code == 401
    assert c.get("/v1/calendar/events").status_code == 401
    assert c.delete("/v1/google/calendar/disconnect").status_code == 401
    app.dependency_overrides.clear()


def test_connect_redirect_params(env):
    res = _client().get("/v1/google/calendar/connect")
    assert res.status_code in (302, 307)
    url = urlparse(res.headers["location"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert url.netloc == "accounts.google.com"
    assert q["scope"] == SCOPE
    assert q["access_type"] == "offline"
    assert q["prompt"] == "consent"
    assert q["include_granted_scopes"] == "true"
    assert q["code_challenge_method"] == "S256"
    assert q["state"] and q["code_challenge"]


def _start(c):
    res = c.get("/v1/google/calendar/connect")
    return parse_qs(urlparse(res.headers["location"]).query)["state"][0]


def test_callback_stores_encrypted_tokens(env):
    a, _, _, responses, session = env
    responses["token"] = httpx.Response(
        200,
        json={
            "access_token": "AT-1",
            "refresh_token": "RT-1",
            "expires_in": 3600,
            "scope": f"openid {SCOPE}",
        },
    )
    c = _client()
    state = _start(c)
    res = c.get(f"/v1/google/calendar/callback?code=abc&state={state}")
    assert res.status_code in (302, 307)
    assert res.headers["location"] == config.WEB_ORIGIN
    row = session.execute(select(GoogleConnection)).scalar_one()
    assert row.user_id == a.id
    assert "AT-1" not in row.access_token_encrypted
    assert "RT-1" not in row.refresh_token_encrypted
    assert crypto.decrypt(row.refresh_token_encrypted) == "RT-1"
    body = parse_qs(calls[0].content.decode())
    assert body["code"] == ["abc"] and body["code_verifier"]
    assert c.get("/v1/calendar/status").json() == {"connected": True}


def test_callback_rejects_bad_state(env):
    _, _, _, responses, session = env
    responses["token"] = httpx.Response(200, json={"access_token": "x", "scope": SCOPE})
    c = _client()
    _start(c)
    res = c.get("/v1/google/calendar/callback?code=abc&state=wrong")
    assert "calendar_error=1" in res.headers["location"]
    assert session.execute(select(GoogleConnection)).first() is None
    assert calls == []


def test_callback_rejects_missing_calendar_scope(env):
    _, _, _, responses, session = env
    responses["token"] = httpx.Response(
        200, json={"access_token": "x", "refresh_token": "y", "scope": "openid"}
    )
    c = _client()
    state = _start(c)
    res = c.get(f"/v1/google/calendar/callback?code=abc&state={state}")
    assert "calendar_error=1" in res.headers["location"]
    assert session.execute(select(GoogleConnection)).first() is None


def test_events_list(env):
    a, _, _, responses, session = env
    _connect_row(session, a)
    responses["events"] = httpx.Response(
        200,
        json={
            "items": [
                {
                    "id": "e1",
                    "summary": "Standup",
                    "start": {"dateTime": "2026-11-09T09:00:00Z"},
                    "end": {"dateTime": "2026-11-09T09:15:00Z"},
                    "location": "Room 1",
                },
                {"id": "e2", "start": {"date": "2026-11-10"}, "end": {"date": "2026-11-11"}},
                {"id": "e3", "status": "cancelled", "summary": "Gone"},
            ]
        },
    )
    res = _client().get("/v1/calendar/events?days=3")
    assert res.status_code == 200
    assert res.json() == [
        {
            "id": "e1",
            "title": "Standup",
            "start": "2026-11-09T09:00:00Z",
            "end": "2026-11-09T09:15:00Z",
            "location": "Room 1",
        },
        {
            "id": "e2",
            "title": "(No title)",
            "start": "2026-11-10",
            "end": "2026-11-11",
            "location": None,
        },
    ]
    req = calls[0]
    assert req.headers["authorization"] == "Bearer AT"
    assert req.url.params["singleEvents"] == "true"
    assert req.url.params["orderBy"] == "startTime"
    assert "/calendars/primary/" in str(req.url)


def test_expired_token_is_refreshed(env):
    a, _, _, responses, session = env
    _connect_row(session, a, expires_in=-10)
    responses["token"] = httpx.Response(200, json={"access_token": "AT-new", "expires_in": 3600})
    responses["events"] = httpx.Response(200, json={"items": []})
    assert _client().get("/v1/calendar/events").json() == []
    assert parse_qs(calls[0].content.decode())["grant_type"] == ["refresh_token"]
    assert calls[1].headers["authorization"] == "Bearer AT-new"
    row = session.execute(select(GoogleConnection)).scalar_one()
    assert crypto.decrypt(row.access_token_encrypted) == "AT-new"


def test_failures_use_safe_messages(env):
    a, _, _, responses, session = env
    _connect_row(session, a, access="SECRET-AT", refresh="SECRET-RT")
    responses["events"] = httpx.Response(500, text="boom SECRET-AT")
    res = _client().get("/v1/calendar/events")
    assert res.status_code == 502
    assert res.json() == {"detail": "Calendar request failed"}
    assert "SECRET" not in res.text


def test_events_not_connected_404(env):
    assert _client().get("/v1/calendar/events").status_code == 404


def test_user_isolation(env):
    a, b, current, responses, session = env
    _connect_row(session, a)
    c = _client()
    assert c.get("/v1/calendar/status").json() == {"connected": True}
    current["user"] = b
    assert c.get("/v1/calendar/status").json() == {"connected": False}
    assert c.get("/v1/calendar/events").status_code == 404
    # B disconnecting must not remove A's connection or revoke A's token.
    assert c.delete("/v1/google/calendar/disconnect").status_code == 204
    assert calls == []
    current["user"] = a
    assert c.get("/v1/calendar/status").json() == {"connected": True}


def test_disconnect_deletes_and_revokes(env):
    a, _, _, _, session = env
    _connect_row(session, a, refresh="RT-x")
    res = _client().delete("/v1/google/calendar/disconnect")
    assert res.status_code == 204
    assert session.execute(select(GoogleConnection)).first() is None
    assert str(calls[0].url).startswith(gcal.REVOKE_URL)
    assert parse_qs(calls[0].content.decode())["token"] == ["RT-x"]
    assert json.dumps(res.text) == '""'
