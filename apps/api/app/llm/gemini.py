import httpx

from app import config
from app.llm.base import LLMError, LLMProvider

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SECONDS = 20

# Safe, fixed messages. Never put the key, headers or the raw response in them.
_HTTP_MESSAGES = {
    401: "Gemini rejected the API key.",
    403: "Gemini refused the request (check the API key and its permissions).",
    404: "Gemini model not found (check GEMINI_MODEL).",
    429: "Gemini rate limit reached. Try again later.",
}


class GeminiProvider(LLMProvider):
    """Calls Gemini through the REST generateContent endpoint."""

    def __init__(self, transport: httpx.BaseTransport | None = None):
        # transport is only for tests (httpx.MockTransport).
        self._transport = transport

    def generate(self, messages: list[dict], system: str | None = None) -> str:
        api_key = (config.GEMINI_API_KEY or "").strip()
        model = (config.GEMINI_MODEL or "").strip()
        if not api_key:
            raise LLMError("GEMINI_API_KEY is not set.")
        if not model:
            raise LLMError("GEMINI_MODEL is not set.")

        body: dict = {
            "contents": [
                {
                    "role": "model" if m["role"] == "assistant" else "user",
                    "parts": [{"text": m["content"]}],
                }
                for m in messages
            ]
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        try:
            with httpx.Client(timeout=TIMEOUT_SECONDS, transport=self._transport) as client:
                response = client.post(
                    API_URL.format(model=model),
                    headers={"x-goog-api-key": api_key},
                    json=body,
                )
        except httpx.TimeoutException:
            raise LLMError("Gemini took too long to answer.") from None
        except httpx.HTTPError:
            raise LLMError("Could not reach Gemini.") from None

        if response.status_code != 200:
            message = _HTTP_MESSAGES.get(response.status_code)
            if message is None:
                if response.status_code >= 500:
                    message = "Gemini is having problems. Try again later."
                else:
                    message = f"Gemini request failed (status {response.status_code})."
            raise LLMError(message)

        try:
            data = response.json()
        except ValueError:
            raise LLMError("Gemini returned an unreadable answer.") from None
        if not isinstance(data, dict):
            raise LLMError("Gemini returned an unreadable answer.")

        feedback = data.get("promptFeedback")
        if isinstance(feedback, dict) and feedback.get("blockReason"):
            raise LLMError("Gemini blocked this message.")

        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise LLMError("Gemini returned no answer.")

        content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        text = "".join(
            p["text"]
            for p in (parts or [])
            if isinstance(p, dict) and isinstance(p.get("text"), str)
        ).strip()
        if not text:
            raise LLMError("Gemini returned an empty or blocked answer.")
        return text
