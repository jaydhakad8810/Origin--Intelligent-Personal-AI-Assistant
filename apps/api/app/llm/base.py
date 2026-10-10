class LLMError(Exception):
    """Raised when a provider cannot produce a reply.

    The message must be safe to show to users: no keys, no stack traces.
    """


class LLMProvider:
    """Base class every provider (demo, Gemini, ...) follows."""

    def generate(self, messages: list[dict], system: str | None = None) -> str:
        """messages: [{"role": "user" | "assistant", "content": str}, ...]"""
        raise NotImplementedError
