from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app import config
from app.models import LlmUsage


class DailyLimitExceeded(Exception):
    pass


LIMIT_MESSAGE = (
    "You have reached today's message limit. Please try again tomorrow."
)


def _today() -> date:
    """Today's date in UTC. Tests replace this to simulate a new day."""
    return datetime.now(timezone.utc).date()


def _insert_for(db: Session):
    # Both PostgreSQL and SQLite support INSERT ... ON CONFLICT DO UPDATE.
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert


def check_and_count(db: Session, user_id) -> None:
    """Count one LLM call for this user today (UTC). Raise if over the limit.

    One atomic statement: insert the row for today, or add 1 to it only while
    the count is still under the limit. If nothing was inserted or updated,
    the user is over the limit and nothing is counted.
    """
    limit = config.LLM_DAILY_LIMIT
    if limit <= 0:
        raise DailyLimitExceeded(LIMIT_MESSAGE)

    stmt = _insert_for(db)(LlmUsage).values(user_id=user_id, day=_today(), count=1)
    stmt = stmt.on_conflict_do_update(
        index_elements=[LlmUsage.user_id, LlmUsage.day],
        set_={"count": LlmUsage.count + 1},
        where=LlmUsage.count < limit,
    ).returning(LlmUsage.count)

    allowed = db.execute(stmt).first() is not None
    db.commit()
    if not allowed:
        raise DailyLimitExceeded(LIMIT_MESSAGE)
