from app import config
from app.llm.base import LLMError, LLMProvider
from app.llm.demo import DemoProvider
from app.llm.gemini import GeminiProvider


def get_provider() -> LLMProvider:
    name = (config.LLM_PROVIDER or "demo").strip().lower()
    if name == "demo":
        return DemoProvider()
    if name == "gemini":
        return GeminiProvider()
    raise LLMError(f'Unknown LLM_PROVIDER "{name}". Supported values: demo, gemini.')
