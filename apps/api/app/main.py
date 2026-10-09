import os
import secrets

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

from app import config, db
from app.auth import router as auth_router
from app.conversations import router as conversations_router

app = FastAPI(title="Origin API")

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# Holds only the short-lived Google login state (state, PKCE verifier, nonce).
app.add_middleware(
    SessionMiddleware,
    secret_key=config.SESSION_SECRET or secrets.token_urlsafe(32),
    session_cookie="origin_oauth",
    max_age=600,
    same_site="lax",
    https_only=config.COOKIE_SECURE,
)

app.include_router(auth_router)
app.include_router(conversations_router)


@app.get("/v1/health")
def health():
    return {"status": "ok", "service": "origin-api"}


@app.get("/v1/health/db")
def health_db():
    try:
        with db.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503, content={"status": "error", "database": "down"}
        )
    return {"status": "ok", "database": "up"}
