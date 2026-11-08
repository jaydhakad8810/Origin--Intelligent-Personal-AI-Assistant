import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config, crypto
from app.auth import get_current_user
from app.db import get_db
from app.models import GoogleConnection, User

SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

router = APIRouter()


def _http() -> httpx.Client:
    return httpx.Client(timeout=10)


def _redirect_uri() -> str:
    return f"{config.API_BASE_URL}/v1/google/calendar/callback"


def _require_config() -> None:
    if not (config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="Calendar is not configured")
    try:
        crypto._fernet()
    except crypto.CryptoError:
        raise HTTPException(status_code=503, detail="Calendar is not configured") from None


def _token_post(data: dict) -> dict | None:
    """POST to Google's token endpoint. Returns the JSON body or None on any failure."""
    try:
        with _http() as client:
            res = client.post(
                TOKEN_URL,
                data={
                    **data,
                    "client_id": config.GOOGLE_CLIENT_ID,
                    "client_secret": config.GOOGLE_CLIENT_SECRET,
                },
            )
        if res.status_code != 200:
            return None
        body = res.json()
        return body if body.get("access_token") else None
    except Exception:
        return None


def _expiry(body: dict) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=int(body.get("expires_in") or 3600))


def _get_row(db: Session, user: User) -> GoogleConnection | None:
    return db.execute(
        select(GoogleConnection).where(GoogleConnection.user_id == user.id)
    ).scalar_one_or_none()


@router.get("/v1/google/calendar/connect")
def connect(request: Request, user: User = Depends(get_current_user)):
    _require_config()
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    request.session["gcal_state"] = state
    request.session["gcal_verifier"] = verifier
    request.session["gcal_user"] = str(user.id)
    params = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return RedirectResponse(f"{AUTH_URL}?{urlencode(params)}")


@router.get("/v1/google/calendar/callback")
def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_config()
    failure = RedirectResponse(f"{config.WEB_ORIGIN}/?calendar_error=1")
    expected = request.session.pop("gcal_state", None)
    verifier = request.session.pop("gcal_verifier", None)
    owner = request.session.pop("gcal_user", None)
    if (
        not code
        or not state
        or not expected
        or not verifier
        or not secrets.compare_digest(state, expected)
        or owner != str(user.id)
    ):
        return failure

    body = _token_post(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
            "code_verifier": verifier,
        }
    )
    if body is None or SCOPE not in (body.get("scope") or "").split():
        return failure

    try:
        row = _get_row(db, user)
        refresh = body.get("refresh_token")
        if not refresh and row is None:
            return failure
        if row is None:
            row = GoogleConnection(user_id=user.id)
            db.add(row)
        if refresh:
            row.refresh_token_encrypted = crypto.encrypt(refresh)
        row.scopes = body["scope"]
        row.access_token_encrypted = crypto.encrypt(body["access_token"])
        row.expires_at = _expiry(body)
        db.commit()
    except Exception:
        db.rollback()
        return failure
    return RedirectResponse(config.WEB_ORIGIN)


@router.get("/v1/calendar/status")
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"connected": _get_row(db, user) is not None}


def _access_token(db: Session, row: GoogleConnection) -> str:
    """Return a valid access token, refreshing it when expired."""
    expires = row.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if (
        row.access_token_encrypted
        and expires is not None
        and expires > datetime.now(timezone.utc) + timedelta(seconds=60)
    ):
        return crypto.decrypt(row.access_token_encrypted)
    body = _token_post(
        {
            "grant_type": "refresh_token",
            "refresh_token": crypto.decrypt(row.refresh_token_encrypted),
        }
    )
    if body is None:
        raise HTTPException(status_code=502, detail="Could not refresh calendar access")
    row.access_token_encrypted = crypto.encrypt(body["access_token"])
    row.expires_at = _expiry(body)
    db.commit()
    return body["access_token"]


@router.get("/v1/calendar/events")
def events(
    days: int = Query(default=7, ge=1, le=60),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_config()
    row = _get_row(db, user)
    if row is None:
        raise HTTPException(status_code=404, detail="Calendar is not connected")
    try:
        token = _access_token(db, row)
        now = datetime.now(timezone.utc)
        with _http() as client:
            res = client.get(
                EVENTS_URL,
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "timeMin": now.isoformat(),
                    "timeMax": (now + timedelta(days=days)).isoformat(),
                    "maxResults": 100,
                },
            )
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="Calendar request failed")
        items = res.json().get("items") or []
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Calendar request failed") from None

    def when(v: dict) -> str | None:
        return v.get("dateTime") or v.get("date")

    return [
        {
            "id": e.get("id"),
            "title": e.get("summary") or "(No title)",
            "start": when(e.get("start") or {}),
            "end": when(e.get("end") or {}),
            "location": e.get("location"),
        }
        for e in items
        if e.get("status") != "cancelled"
    ]


@router.delete("/v1/google/calendar/disconnect", status_code=204)
def disconnect(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _get_row(db, user)
    if row is None:
        return
    try:
        token = crypto.decrypt(row.refresh_token_encrypted)
    except crypto.CryptoError:
        token = None
    db.delete(row)
    db.commit()
    if token:
        try:  # best effort; the local row is already gone
            with _http() as client:
                client.post(REVOKE_URL, data={"token": token})
        except Exception:
            pass
