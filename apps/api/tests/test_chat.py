from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_ok():
    response = client.post("/v1/chat", json={"message": "hi"})
    assert response.status_code == 200
    assert response.json() == {
        "reply": 'Demo mode. You said: "hi". Real answers arrive once the AI is connected.'
    }


def test_chat_empty_message():
    response = client.post("/v1/chat", json={"message": ""})
    assert response.status_code == 422


def test_chat_message_too_long():
    response = client.post("/v1/chat", json={"message": "a" * 2001})
    assert response.status_code == 422
