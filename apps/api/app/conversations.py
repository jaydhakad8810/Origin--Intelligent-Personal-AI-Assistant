import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.llm import limiter
from app.llm.base import LLMError
from app.llm.factory import get_provider
from app.llm.prompts import DEFAULT_SYSTEM_PROMPT
from app.models import Conversation, Message, User

router = APIRouter(prefix="/v1")

TITLE_LENGTH = 40
LIST_LIMIT = 50
HISTORY_LIMIT = 20
LLM_ERROR_MESSAGE = "Sorry, the assistant is unavailable right now. Please try again later."


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    reply: str
    conversation_id: uuid.UUID


def _own_conversation(db: Session, user: User, conversation_id: uuid.UUID):
    """Return the user's conversation, or 404. Other users' ids look the same as missing ones."""
    conversation = db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/conversations")
def list_conversations(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(LIST_LIMIT)
    ).scalars()
    return [{"id": c.id, "title": c.title, "updated_at": c.updated_at} for c in rows]


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _own_conversation(db, user, conversation_id)
    rows = db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id, Message.user_id == user.id)
        .order_by(Message.created_at.asc())
    ).scalars()
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
        for m in rows
    ]


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _own_conversation(db, user, conversation_id)
    # Delete messages explicitly too, so it also works where the database
    # does not enforce foreign-key cascades.
    db.execute(delete(Message).where(Message.conversation_id == conversation.id))
    db.execute(delete(Conversation).where(Conversation.id == conversation.id))
    db.commit()
    return Response(status_code=204)


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check the existing conversation first, then ask the AI, and only then
    # save anything. A failure leaves no half-saved chat.
    history = []
    if body.conversation_id is not None:
        existing = _own_conversation(db, user, body.conversation_id)
        rows = db.execute(
            select(Message)
            .where(Message.conversation_id == existing.id, Message.user_id == user.id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_LIMIT)
        ).scalars()
        history = [{"role": m.role, "content": m.content} for m in reversed(list(rows))]

    try:
        limiter.check_and_count(user.id)
    except limiter.DailyLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    try:
        reply = get_provider().generate(
            history + [{"role": "user", "content": body.message}],
            DEFAULT_SYSTEM_PROMPT,
        )
    except LLMError:
        raise HTTPException(status_code=502, detail=LLM_ERROR_MESSAGE)
    except Exception:
        # Never leak provider details (or keys) to the client.
        raise HTTPException(status_code=502, detail=LLM_ERROR_MESSAGE)

    now = datetime.now(timezone.utc)
    if body.conversation_id is None:
        conversation = Conversation(
            user_id=user.id,
            title=body.message[:TITLE_LENGTH],
            created_at=now,
            updated_at=now,
        )
        db.add(conversation)
        db.flush()
    else:
        conversation = existing

    db.add(
        Message(
            conversation_id=conversation.id,
            user_id=user.id,
            role="user",
            content=body.message,
            created_at=now,
        )
    )
    db.add(
        Message(
            conversation_id=conversation.id,
            user_id=user.id,
            role="assistant",
            content=reply,
            # A tiny gap keeps the order stable even if timestamps are coarse.
            created_at=now + timedelta(milliseconds=1),
        )
    )
    conversation.updated_at = now + timedelta(milliseconds=1)
    db.commit()
    return {"reply": reply, "conversation_id": conversation.id}
