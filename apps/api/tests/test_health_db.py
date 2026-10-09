from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import db
from app.main import app

client = TestClient(app)


def test_health_db_up(monkeypatch):
    monkeypatch.setattr(db, "engine", MagicMock())
    response = client.get("/v1/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up"}


def test_health_db_down(monkeypatch):
    engine = MagicMock()
    engine.connect.side_effect = Exception("secret details")
    monkeypatch.setattr(db, "engine", engine)
    response = client.get("/v1/health/db")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "down"}


def test_health_db_no_engine(monkeypatch):
    monkeypatch.setattr(db, "engine", None)
    response = client.get("/v1/health/db")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "down"}
