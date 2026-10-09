import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Origin API")

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    reply: str


@app.get("/v1/health")
def health():
    return {"status": "ok", "service": "origin-api"}


@app.post("/v1/chat", response_model=ChatResponse)
def chat(body: ChatRequest):
    return {
        "reply": f'Demo mode. You said: "{body.message}". Real answers arrive once the AI is connected.'
    }
