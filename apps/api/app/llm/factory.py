from app import config
from app.llm.base import LLMError, LLMProvider
from app.llm.demo import DemoProvider


def get_provider() -> LLMProvider:
    name = (config.LLM_PROVIDER or "demo").strip().lower()
    if name == "demo":
        return DemoProvider()
    raise LLMError(f'Unknown LLM_PROVIDER "{name}". Supported values: demo.')
