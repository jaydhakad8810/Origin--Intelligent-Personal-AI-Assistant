from app.llm.base import LLMProvider


class DemoProvider(LLMProvider):
    """Fake provider: echoes the last user message. No network."""

    def generate(self, messages: list[dict], system: str | None = None) -> str:
        last = messages[-1]["content"] if messages else ""
        return f'Demo mode. You said: "{last}". Real answers arrive once the AI is connected.'
