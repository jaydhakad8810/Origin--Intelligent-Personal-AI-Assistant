import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Note, User

router = APIRouter(prefix="/v1")

TITLE_MAX = 200
CONTENT_MAX = 10000
LIST_LIMIT = 200
EMPTY_NOTE_MESSAGE = "A note needs a title or some text."


class NoteCreate(BaseModel):
    title: str = Field(default="", max_length=TITLE_MAX)
    content: str = Field(default="", max_length=CONTENT_MAX)

    @field_validator("title")
    @classmethod
    def _trim_title(cls, v: str) -> str:
        return v.strip()


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=TITLE_MAX)
    content: str | None = Field(default=None, max_length=CONTENT_MAX)

    @field_validator("title")
    @classmethod
    def _trim_title(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


def _own_note(db: Session, user: User, note_id: uuid.UUID) -> Note:
    """Return the user's note, or 404. Other users' ids look the same as missing ones."""
    note = db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _check_not_empty(title: str, content: str) -> None:
    if not title and not content.strip():
        raise HTTPException(status_code=422, detail=EMPTY_NOTE_MESSAGE)


def _out(n: Note) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "content": n.content,
        "created_at": n.created_at,
        "updated_at": n.updated_at,
    }


@router.get("/notes")
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Note)
        .where(Note.user_id == user.id)
        .order_by(Note.created_at.desc())
        .limit(LIST_LIMIT)
    ).scalars()
    return [_out(n) for n in rows]


@router.post("/notes", status_code=201)
def create_note(
    body: NoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_not_empty(body.title, body.content)
    now = datetime.now(timezone.utc)
    note = Note(
        user_id=user.id,
        title=body.title,
        content=body.content,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.commit()
    return _out(note)


@router.patch("/notes/{note_id}")
def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = _own_note(db, user, note_id)
    title = note.title if body.title is None else body.title
    content = note.content if body.content is None else body.content
    _check_not_empty(title, content)
    note.title = title
    note.content = content
    note.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _out(note)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = _own_note(db, user, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=204)
