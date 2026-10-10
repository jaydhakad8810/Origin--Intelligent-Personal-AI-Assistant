from datetime import datetime, timezone

from app import config

# Dev only: this counter lives in memory, so it resets on restart and is not
# shared between processes. Move it to the database before production.
_counts: dict[tuple[str, str], int] = {}


class DailyLimitExceeded(Exception):
    pass


LIMIT_MESSAGE = (
    "You have reached today's message limit. Please try again tomorrow."
)


def check_and_count(user_id) -> None:
    """Count one request for this user today (UTC). Raise if over the limit."""
    today = datetime.now(timezone.utc).date().isoformat()
    key = (str(user_id), today)
    # Drop counters from earlier days so memory does not grow forever.
    for old in [k for k in _counts if k[1] != today]:
        del _counts[old]
    if _counts.get(key, 0) >= config.LLM_DAILY_LIMIT:
        raise DailyLimitExceeded(LIMIT_MESSAGE)
    _counts[key] = _counts.get(key, 0) + 1


def reset() -> None:
    _counts.clear()
