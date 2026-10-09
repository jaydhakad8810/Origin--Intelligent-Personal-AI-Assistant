"use client";

import { useEffect, useRef, useState } from "react";

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 520;
const GAP = 12;
const MARGIN = 8;
const MAX_LENGTH = 2000;
const REQUEST_TIMEOUT_MS = 15000;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ERROR_TEXT = "Can't reach Origin server. Is the API running?";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type ChatPanelProps = {
  open: boolean;
  onClose: () => void;
  orbRef: React.RefObject<HTMLButtonElement | null>;
};

type PanelPosition = { x: number; y: number; height: number };

// Opens above the orb if there is room, otherwise below, always inside the viewport.
function computePosition(orb: DOMRect): PanelPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const height = Math.min(PANEL_HEIGHT, vh - MARGIN * 2);
  const width = Math.min(PANEL_WIDTH, vw - MARGIN * 2);

  const x = Math.min(Math.max(orb.right - width, MARGIN), vw - width - MARGIN);

  const above = orb.top - GAP - height;
  const below = orb.bottom + GAP;
  let y: number;
  if (above >= MARGIN) y = above;
  else if (below + height <= vh - MARGIN) y = below;
  else y = Math.min(Math.max(above, MARGIN), vh - height - MARGIN);

  return { x, y, height };
}

const CHIPS = ["Note", "Tasks", "Calendar"];

export default function ChatPanel({ open, onClose, orbRef }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const nextId = useRef(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Place the panel next to the orb whenever it opens or the window resizes.
  useEffect(() => {
    if (!open) return;
    function place() {
      const orb = orbRef.current;
      if (orb) setPosition(computePosition(orb.getBoundingClientRect()));
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, orbRef]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, waiting, open]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || waiting) return;
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", content: text },
    ]);
    setDraft("");
    setWaiting(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let reply = ERROR_TEXT;
    try {
      const res = await fetch(`${API_URL}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { reply?: unknown };
        if (typeof data.reply === "string") reply = data.reply;
      }
    } catch {
      // Network error, timeout or abort: keep the error text.
    } finally {
      window.clearTimeout(timeout);
    }
    if (controller.signal.aborted && controllerRef.current !== controller) return;
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "assistant", content: reply },
    ]);
    setWaiting(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  if (!open) return null;

  const style = position
    ? ({
        "--panel-x": `${position.x}px`,
        "--panel-y": `${position.y}px`,
        "--panel-h": `${position.height}px`,
        visibility: "visible",
      } as React.CSSProperties)
    : { visibility: "hidden" as const };

  const focusRing =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";

  return (
    <div
      role="dialog"
      aria-label="Origin assistant"
      onKeyDown={handleDialogKeyDown}
      style={style}
      className="origin-panel fixed z-50 flex flex-col overflow-hidden border border-white/10 bg-zinc-950/80 text-zinc-100 shadow-[0_0_30px_rgba(96,165,250,0.25),0_0_60px_rgba(168,85,247,0.2)] backdrop-blur-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[70dvh] max-sm:rounded-t-2xl sm:top-[var(--panel-y)] sm:left-[var(--panel-x)] sm:h-[var(--panel-h)] sm:w-[380px] sm:rounded-2xl"
    >
      <header className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-pink-500/15 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          draggable={false}
          className="h-8 w-8 rounded-full object-cover"
        />
        <h2 className="flex-1 text-sm font-semibold tracking-wide">Origin</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 ${focusRing}`}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div
        ref={bodyRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 && !waiting ? (
          <p className="m-auto text-sm text-zinc-400">How can I help you?</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-purple-500 px-3 py-2 text-sm break-words whitespace-pre-wrap text-white"
                  : "max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm break-words whitespace-pre-wrap text-zinc-100"
              }
            >
              {m.content}
            </div>
          ))
        )}
        {waiting && (
          <p className="self-start text-xs text-zinc-400">Origin is typing...</p>
        )}
      </div>

      <footer className="border-t border-white/10 px-4 py-3">
        <div className="mb-2 flex gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled
              title="Coming soon"
              className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
            rows={2}
            aria-label="Message"
            placeholder="Type a message..."
            className={`min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className={`h-11 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
