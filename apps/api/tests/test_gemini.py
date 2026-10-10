import json

import httpx
import pytest

from app import config
from app.llm.base import LLMError
from app.llm.factory import get_provider
from app.llm.gemini import GeminiProvider

SECRET = "SECRET-KEY-123"
RAW_BODY = "RAW-BODY-LEAK-XYZ"
MSG = [{"role": "user", "content": "x"}]


@pytest.fixture(autouse=True)
def gemini_config(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", SECRET)
    monkeypatch.setattr(config, "GEMINI_MODEL", "test-model")


def provider(handler):
    return GeminiProvider(transport=httpx.MockTransport(handler))


def test_success_sends_correct_request():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("x-goog-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "Hi "}, {"text": "there"}]}}]},
        )

    reply = provider(handler).generate(
        [{"role": "user", "content": "yo"}, {"role": "assistant", "content": "hey"}],
        "be nice",
    )
    assert reply == "Hi there"
    assert seen["url"].endswith("/models/test-model:generateContent")
    assert "key=" not in seen["url"]
    assert seen["key"] == SECRET
    assert [c["role"] for c in seen["body"]["contents"]] == ["user", "model"]
    assert seen["body"]["systemInstruction"] == {"parts": [{"text": "be nice"}]}


def test_429_is_safe_error():
    with pytest.raises(LLMError) as e:
        provider(lambda r: httpx.Response(429, text=RAW_BODY)).generate(MSG)
    assert "rate limit" in str(e.value)
    assert RAW_BODY not in str(e.value)


def test_empty_candidates():
    with pytest.raises(LLMError):
        provider(lambda r: httpx.Response(200, json={"candidates": []})).generate(MSG)


def test_blocked_prompt():
    handler = lambda r: httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})
    with pytest.raises(LLMError, match="blocked"):
        provider(handler).generate(MSG)


def test_missing_key(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    with pytest.raises(LLMError, match="GEMINI_API_KEY"):
        provider(lambda r: httpx.Response(200)).generate(MSG)


def test_missing_model(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_MODEL", None)
    with pytest.raises(LLMError, match="GEMINI_MODEL"):
        provider(lambda r: httpx.Response(200)).generate(MSG)


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500, 503])
def test_key_never_in_error_text(status):
    def handler(request):
        return httpx.Response(status, text=f"{SECRET} x-goog-api-key {RAW_BODY}")

    with pytest.raises(LLMError) as e:
        provider(handler).generate(MSG)
    text = str(e.value)
    assert SECRET not in text and "x-goog-api-key" not in text and RAW_BODY not in text


def test_network_error_has_no_key():
    def handler(request):
        raise httpx.ConnectError(f"boom {SECRET}", request=request)

    with pytest.raises(LLMError) as e:
        provider(handler).generate(MSG)
    assert SECRET not in str(e.value)
    assert e.value.__cause__ is None


def test_factory_returns_gemini(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "gemini")
    assert isinstance(get_provider(), GeminiProvider)
