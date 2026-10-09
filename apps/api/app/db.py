from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL


def normalize_url(url: str) -> str:
    """Use the psycopg v3 driver for plain postgres URLs."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


engine = (
    create_engine(normalize_url(DATABASE_URL), pool_pre_ping=True)
    if DATABASE_URL
    else None
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False) if engine else None


def get_db():
    """FastAPI dependency: yields a session, always closes it."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not set")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
