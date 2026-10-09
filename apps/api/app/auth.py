import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.models import AuthSession, User

COOKIE_NAME = "origin_session"
SESSION_DAYS = 30
GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"

router = APIRouter(prefix="/v1/auth")

_oauth: OAuth | None = None


def _google():
    """Build the Google OAuth client once. 503 if login is not configured."""
    global _oauth
    if not (
        config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET and config.SESSION_SECRET
    ):
        raise HTTPException(status_code=503, detail="Sign-in is not configured")
    if _oauth is None:
        _oauth = OAuth()
        _oauth.register(
            name="google",
            client_id=config.GOOGLE_CLIENT_ID,
            client_secret=config.GOOGLE_CLIENT_SECRET,
            server_metadata_url=GOOGLE_METADATA_URL,
            client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
        )
    return _oauth.google


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_current_user(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    row = db.execute(
        select(User)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            AuthSession.token_hash == hash_token(token),
            AuthSession.expires_at > datetime.now(timezone.utc),
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return row


@router.get("/google/login")
async def google_login(request: Request):
    google = _google()
    return await google.authorize_redirect(
        request, f"{config.API_BASE_URL}/v1/auth/google/callback"
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    google = _google()
    failure = RedirectResponse(f"{config.WEB_ORIGIN}/?auth_error=1")
    try:
        token = await google.authorize_access_token(request)
        info = token.get("userinfo") or {}
        sub, email = info.get("sub"), info.get("email")
        if not sub or not email or info.get("email_verified") is not True:
            return failure

        user = db.execute(select(User).where(User.google_sub == sub)).scalar_one_or_none()
        if user is None:
            user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = User(email=email)
            db.add(user)
        user.google_sub = sub
        user.email = email
        user.name = info.get("name")
        user.picture = info.get("picture")
        db.flush()

        raw = secrets.token_urlsafe(32)
        db.add(
            AuthSession(
                user_id=user.id,
                token_hash=hash_token(raw),
                expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        return failure

    response = RedirectResponse(config.WEB_ORIGIN)
    response.set_cookie(
        COOKIE_NAME,
        raw,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=config.COOKIE_SECURE,
        path="/",
    )
    return response


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": str(user.id), "email": user.email, "name": user.name, "picture": user.picture}


@router.post("/logout", status_code=204)
def logout(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=config.COOKIE_SECURE,
    )
    return response
