# Origin API
Setup: `python -m venv .venv`
Install: `.\.venv\Scripts\python -m pip install -r requirements.txt`
Run: `.\.venv\Scripts\python -m uvicorn app.main:app --reload`
Test: `.\.venv\Scripts\python -m pytest`
Health check: http://127.0.0.1:8000/v1/health
