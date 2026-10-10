from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints

from app.auth import get_current_user
from app.llm import limiter
from app.llm.factory import get_provider
from app.llm.prompts import EMAIL_POLISH_PROMPT
from app.models import User

router = APIRouter(prefix="/v1/email")

TEXT_MAX = 5000
LLM_ERROR_MESSAGE = "Sorry, the assistant is unavailable right now. Please try again later."
SUBJECT_PREFIX = "Subject:"


class PolishRequest(BaseModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TEXT_MAX)
    ]
    tone: Literal["formal", "professional", "friendly"] = "professional"


class PolishResponse(BaseModel):
    subject: str
    body: str


def _split_reply(reply: str) -> tuple[str, str]:
    """Split "Subject: ..." off the first line. No Subject line: subject is empty."""
    text = reply.strip()
    first, _, rest = text.partition("\n")
    if first.strip().lower().startswith(SUBJECT_PREFIX.lower()):
        return first.strip()[len(SUBJECT_PREFIX):].strip(), rest.strip()
    return "", text


# Nothing here touches the database, and the mail text is never logged.
@router.post("/polish", response_model=PolishResponse)
def polish(body: PolishRequest, user: User = Depends(get_current_user)):
    try:
        limiter.check_and_count(user.id)
    except limiter.DailyLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    prompt = f"{EMAIL_POLISH_PROMPT}\nRequested tone: {body.tone}."
    try:
        reply = get_provider().generate(
            [{"role": "user", "content": body.text}], prompt
        )
    except Exception:
        # Never leak provider details (or keys) to the client.
        raise HTTPException(status_code=502, detail=LLM_ERROR_MESSAGE)

    subject, mail_body = _split_reply(reply)
    return {"subject": subject, "body": mail_body}
