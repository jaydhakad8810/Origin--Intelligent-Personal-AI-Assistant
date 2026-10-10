import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Optional: the app starts without it; DB features report "down".
DATABASE_URL = os.getenv("DATABASE_URL")

# Google login. Optional: the app starts without them; auth routes return 503.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SESSION_SECRET = os.getenv("SESSION_SECRET")
WEB_ORIGIN = os.getenv("WEB_ORIGIN") or "http://localhost:3000"
API_BASE_URL = os.getenv("API_BASE_URL") or "http://localhost:8000"
COOKIE_SECURE = (os.getenv("COOKIE_SECURE") or "false").strip().lower() in (
    "1",
    "true",
    "yes",
)

# LLM gateway. "demo" needs no key and no network.
LLM_PROVIDER = (os.getenv("LLM_PROVIDER") or "demo").strip().lower()
try:
    LLM_DAILY_LIMIT = int(os.getenv("LLM_DAILY_LIMIT") or 50)
except ValueError:
    LLM_DAILY_LIMIT = 50
# Placeholders for the Gemini provider (not used yet). Never log or return these.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL")
