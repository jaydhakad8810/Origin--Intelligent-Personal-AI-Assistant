import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Optional: the app starts without it; DB features report "down".
DATABASE_URL = os.getenv("DATABASE_URL")
