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

type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
};

type NoteItem = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

// id null = a new note that is not saved yet.
type NoteDraft = { id: string | null; title: string; content: string };

const NOTE_TITLE_MAX = 200;
const NOTE_CONTENT_MAX = 10000;

type LoadState = "idle" | "loading" | "error";

type ChatPanelProps = {
  open: boolean;
  onClose: () => void;
  orbRef: React.RefObject<HTMLButtonElement | null>;
};

type AuthState = "loading" | "signedOut" | "signedIn";

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

const EMAIL_MAX = 5000;
const MAILTO_BODY_MAX = 1800;
const EMAIL_TIMEOUT_MS = 60000;
const TONES = ["formal", "professional", "friendly"] as const;
type Tone = (typeof TONES)[number];

const CHIPS = ["Note", "Email", "Tasks", "Calendar"];

export default function ChatPanel({ open, onClose, orbRef }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [auth, setAuth] = useState<AuthState>("loading");
  const [userName, setUserName] = useState("");
  const [authError] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("auth_error") === "1",
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history" | "notes" | "email">("chat");
  const [emailText, setEmailText] = useState("");
  const [emailTone, setEmailTone] = useState<Tone>("professional");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailHasResult, setEmailHasResult] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [notesState, setNotesState] = useState<LoadState>("idle");
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listState, setListState] = useState<LoadState>("idle");
  const [messagesState, setMessagesState] = useState<LoadState>("idle");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
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

  // Show "Sign-in failed" once if Google sent us back with ?auth_error=1, then clean the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth_error") === "1") {
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  // Ask the API who is signed in each time the panel opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/auth/me`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { name?: unknown; email?: unknown };
          setUserName(
            typeof data.name === "string" && data.name
              ? data.name
              : typeof data.email === "string"
                ? data.email
                : "",
          );
          setAuth("signedIn");
        } else {
          setAuth("signedOut");
        }
      } catch {
        if (!controller.signal.aborted) setAuth("signedOut");
      }
    })();
    return () => controller.abort();
  }, [open]);

  // Signed in and open: load the list, open the latest conversation and its messages.
  useEffect(() => {
    if (!open || auth !== "signedIn") return;
    const controller = new AbortController();
    (async () => {
      setListState("loading");
      setMessagesState("idle");
      try {
        const list = await fetchConversations(controller.signal);
        if (!list) return;
        setConversations(list);
        setListState("idle");
        if (list.length > 0) await openConversation(list[0].id, controller.signal);
      } catch {
        if (!controller.signal.aborted) setListState("error");
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auth]);

  useEffect(() => {
    if (open && auth === "signedIn") textareaRef.current?.focus();
  }, [open, auth]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, waiting, open]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // GET helper: returns the response, or null (and shows the sign-in card) on 401.
  async function apiGet(path: string, signal: AbortSignal) {
    const res = await fetch(`${API_URL}${path}`, { credentials: "include", signal });
    if (res.status === 401) {
      setAuth("signedOut");
      setMessages([]);
      setConversationId(null);
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  async function fetchConversations(signal: AbortSignal) {
    const res = await apiGet("/v1/conversations", signal);
    return res ? ((await res.json()) as ConversationSummary[]) : null;
  }

  async function openConversation(id: string, signal: AbortSignal) {
    setMessagesState("loading");
    try {
      const res = await apiGet(`/v1/conversations/${id}/messages`, signal);
      if (!res) return;
      const rows = (await res.json()) as {
        role: "user" | "assistant";
        content: string;
      }[];
      setMessages(
        rows.map((r) => ({ id: nextId.current++, role: r.role, content: r.content })),
      );
      setConversationId(id);
      setView("chat");
      setMessagesState("idle");
    } catch (error) {
      if (!signal.aborted) setMessagesState("error");
      throw error;
    }
  }

  function newChat() {
    controllerRef.current?.abort();
    setWaiting(false);
    setMessages([]);
    setConversationId(null);
    setMessagesState("idle");
    setView("chat");
    textareaRef.current?.focus();
  }

  async function showHistory() {
    setView("history");
    setConfirmDeleteId(null);
    setDeleteError(false);
    setListState("loading");
    try {
      const list = await fetchConversations(new AbortController().signal);
      if (!list) return;
      setConversations(list);
      setListState("idle");
    } catch {
      setListState("error");
    }
  }

  async function pickConversation(id: string) {
    controllerRef.current?.abort();
    setWaiting(false);
    try {
      await openConversation(id, new AbortController().signal);
    } catch {
      // messagesState is already "error"; show it in the chat view.
      setView("chat");
    }
  }

  async function deleteConversation(id: string) {
    setDeleteError(false);
    try {
      const res = await fetch(`${API_URL}/v1/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 401) {
        setAuth("signedOut");
        return;
      }
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch {
      setDeleteError(true);
      return;
    }
    setConfirmDeleteId(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) newChat();
    setView("history");
  }

  async function showNotes() {
    setView("notes");
    setNoteDraft(null);
    setNoteError("");
    setConfirmDeleteNoteId(null);
    setNotesState("loading");
    try {
      const res = await fetch(`${API_URL}/v1/notes`, { credentials: "include" });
      if (res.status === 401) {
        setAuth("signedOut");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes((await res.json()) as NoteItem[]);
      setNotesState("idle");
    } catch {
      setNotesState("error");
    }
  }

  // Saves the open note (create or update). Shows a friendly message on failure.
  async function saveNote() {
    if (!noteDraft || noteSaving) return;
    if (!noteDraft.title.trim() && !noteDraft.content.trim()) {
      setNoteError("A note needs a title or some text.");
      return;
    }
    setNoteSaving(true);
    setNoteError("");
    try {
      const isNew = noteDraft.id === null;
      const res = await fetch(
        `${API_URL}/v1/notes${isNew ? "" : `/${noteDraft.id}`}`,
        {
          method: isNew ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: noteDraft.title, content: noteDraft.content }),
        },
      );
      if (res.status === 401) {
        setAuth("signedOut");
        return;
      }
      if (res.status === 404) {
        setNoteError("This note no longer exists.");
        return;
      }
      if (res.status === 422) {
        setNoteError("Please check the note: it needs a title or text, and must not be too long.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = (await res.json()) as NoteItem;
      setNotes((prev) =>
        isNew ? [saved, ...prev] : prev.map((n) => (n.id === saved.id ? saved : n)),
      );
      setNoteDraft(null);
    } catch {
      setNoteError("Could not save the note. Try again.");
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote(id: string) {
    setNoteError("");
    try {
      const res = await fetch(`${API_URL}/v1/notes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 401) {
        setAuth("signedOut");
        return;
      }
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch {
      setNoteError("Delete failed. Try again.");
      return;
    }
    setConfirmDeleteNoteId(null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function polishEmail() {
    const text = emailText.trim();
    if (!text || emailLoading) return;
    setEmailLoading(true);
    setEmailError("");
    setEmailCopied(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_URL}/v1/email/polish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone: emailTone }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        setAuth("signedOut");
        return;
      }
      if (res.status === 422) {
        setEmailError("Please write something, up to 5000 characters.");
        return;
      }
      if (res.status === 429) {
        setEmailError("You have reached today's limit. Please try again tomorrow.");
        return;
      }
      if (res.status === 502) {
        setEmailError("Sorry, the assistant is unavailable right now. Please try again later.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { subject?: unknown; body?: unknown };
      setEmailSubject(typeof data.subject === "string" ? data.subject : "");
      setEmailBody(typeof data.body === "string" ? data.body : "");
      setEmailHasResult(true);
    } catch {
      setEmailError(ERROR_TEXT);
    } finally {
      window.clearTimeout(timeout);
      setEmailLoading(false);
    }
  }

  async function copyEmail() {
    const full = emailSubject ? `Subject: ${emailSubject}\n\n${emailBody}` : emailBody;
    try {
      await navigator.clipboard.writeText(full);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      setEmailError("Could not copy. Select the text and copy it yourself.");
    }
  }

  function showEmail() {
    setView("email");
    setEmailError("");
  }

  async function signOut() {
    try {
      await fetch(`${API_URL}/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the request fails, show the sign-in card.
    }
    setMessages([]);
    setConversationId(null);
    setConversations([]);
    setNotes([]);
    setNoteDraft(null);
    setEmailText("");
    setEmailSubject("");
    setEmailBody("");
    setEmailHasResult(false);
    setEmailError("");
    setView("chat");
    setAuth("signedOut");
  }

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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        setAuth("signedOut");
        setMessages([]);
        setWaiting(false);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as {
          reply?: unknown;
          conversation_id?: unknown;
        };
        if (typeof data.reply === "string") reply = data.reply;
        if (typeof data.conversation_id === "string") {
          setConversationId(data.conversation_id);
        }
      } else if (res.status === 404) {
        // The conversation was deleted elsewhere: start fresh next time.
        setConversationId(null);
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
        <h2 className="flex-1 truncate text-sm font-semibold tracking-wide">
          Origin
          {auth === "signedIn" && userName && (
            <span className="ml-2 font-normal text-zinc-300">{userName}</span>
          )}
        </h2>
        {auth === "signedIn" && (
          <>
            <button
              type="button"
              onClick={newChat}
              className={`rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
            >
              New chat
            </button>
            <button
              type="button"
              onClick={() => (view !== "chat" ? setView("chat") : showHistory())}
              className={`rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
            >
              {view !== "chat" ? "Back" : "History"}
            </button>
          </>
        )}
        {auth === "signedIn" && (
          <button
            type="button"
            onClick={signOut}
            className={`rounded-full px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
          >
            Sign out
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 ${focusRing}`}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      {auth !== "signedIn" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {auth === "loading" ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : (
            <>
              {authError && (
                <p role="alert" className="text-sm text-red-300">
                  Sign-in failed. Try again.
                </p>
              )}
              <p className="text-sm text-zinc-300">Sign in to chat with Origin.</p>
              <a
                href={`${API_URL}/v1/auth/google/login`}
                className={`rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white ${focusRing}`}
              >
                Sign in with Google
              </a>
            </>
          )}
        </div>
      ) : view === "email" ? (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          <p className="text-xs text-zinc-400">
            Origin never sends this. You send it yourself.
          </p>
          <p className="text-xs text-amber-300">Early demo: use sample text only.</p>
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            maxLength={EMAIL_MAX}
            rows={5}
            aria-label="Rough email"
            placeholder="Write your rough email..."
            className={`min-h-[110px] resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
          />
          <div className="flex items-center gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEmailTone(t)}
                aria-pressed={emailTone === t}
                className={`rounded-full border px-3 py-1 text-xs capitalize ${
                  emailTone === t
                    ? "border-fuchsia-400 bg-white/10 text-zinc-100"
                    : "border-white/10 text-zinc-300 hover:bg-white/10"
                } ${focusRing}`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={polishEmail}
              disabled={emailLoading || !emailText.trim()}
              className={`ml-auto rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 px-4 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            >
              {emailLoading ? "Polishing..." : "Polish"}
            </button>
          </div>
          {emailError && (
            <p role="alert" className="text-xs text-red-300">
              {emailError}
            </p>
          )}
          {emailHasResult && (
            <>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                aria-label="Email subject"
                placeholder="Subject"
                className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
              />
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={8}
                aria-label="Email body"
                className={`min-h-[140px] resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 ${focusRing}`}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                {emailBody.length > MAILTO_BODY_MAX && (
                  <span className="mr-auto text-xs text-zinc-400">Too long, use Copy</span>
                )}
                <button
                  type="button"
                  onClick={copyEmail}
                  className={`rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10 ${focusRing}`}
                >
                  {emailCopied ? "Copied" : "Copy"}
                </button>
                {emailBody.length > MAILTO_BODY_MAX ? (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500"
                  >
                    Open in mail app
                  </button>
                ) : (
                  <a
                    href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                    className={`rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10 ${focusRing}`}
                  >
                    Open in mail app
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      ) : view === "notes" ? (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {noteDraft ? (
            <>
              <input
                value={noteDraft.title}
                onChange={(e) => setNoteDraft({ ...noteDraft, title: e.target.value })}
                maxLength={NOTE_TITLE_MAX}
                aria-label="Note title"
                placeholder="Title"
                className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
              />
              <textarea
                value={noteDraft.content}
                onChange={(e) => setNoteDraft({ ...noteDraft, content: e.target.value })}
                maxLength={NOTE_CONTENT_MAX}
                aria-label="Note text"
                placeholder="Write your note..."
                className={`min-h-[160px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
              />
              {noteError && (
                <p role="alert" className="text-xs text-red-300">
                  {noteError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(null);
                    setNoteError("");
                  }}
                  className={`rounded-full px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={noteSaving}
                  className={`rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 px-4 py-1 text-xs font-medium text-white disabled:opacity-40 ${focusRing}`}
                >
                  {noteSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          ) : notesState === "loading" ? (
            <p className="m-auto text-sm text-zinc-400">Loading...</p>
          ) : notesState === "error" ? (
            <div className="m-auto text-center">
              <p role="alert" className="text-sm text-red-300">
                Could not load notes.
              </p>
              <button
                type="button"
                onClick={showNotes}
                className={`mt-2 rounded-full border border-white/10 px-3 py-1 text-xs ${focusRing}`}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setNoteDraft({ id: null, title: "", content: "" });
                  setNoteError("");
                }}
                className={`self-start rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10 ${focusRing}`}
              >
                New note
              </button>
              {noteError && (
                <p role="alert" className="text-xs text-red-300">
                  {noteError}
                </p>
              )}
              {notes.length === 0 ? (
                <p className="m-auto text-sm text-zinc-400">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    {confirmDeleteNoteId === n.id ? (
                      <>
                        <p className="flex-1 text-xs text-zinc-200">Delete permanently?</p>
                        <button
                          type="button"
                          onClick={() => deleteNote(n.id)}
                          className={`rounded-full bg-red-500/80 px-3 py-1 text-xs text-white ${focusRing}`}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteNoteId(null);
                            setNoteError("");
                          }}
                          className={`rounded-full px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteDraft({ id: n.id, title: n.title, content: n.content });
                            setNoteError("");
                          }}
                          className={`min-w-0 flex-1 text-left ${focusRing}`}
                        >
                          <span className="block truncate text-sm">
                            {n.title || n.content}
                          </span>
                          <span className="block text-xs text-zinc-400">
                            {new Date(n.updated_at).toLocaleString()}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteNoteId(n.id);
                            setNoteError("");
                          }}
                          aria-label={`Delete note ${n.title || n.content.slice(0, 30)}`}
                          className={`rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      ) : view === "history" ? (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {listState === "loading" ? (
            <p className="m-auto text-sm text-zinc-400">Loading...</p>
          ) : listState === "error" ? (
            <div className="m-auto text-center">
              <p role="alert" className="text-sm text-red-300">
                Could not load history.
              </p>
              <button
                type="button"
                onClick={showHistory}
                className={`mt-2 rounded-full border border-white/10 px-3 py-1 text-xs ${focusRing}`}
              >
                Try again
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <p className="m-auto text-sm text-zinc-400">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                {confirmDeleteId === c.id ? (
                  <>
                    <p className="flex-1 text-xs text-zinc-200">
                      Delete permanently?
                      {deleteError && (
                        <span role="alert" className="block text-red-300">
                          Delete failed. Try again.
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      className={`rounded-full bg-red-500/80 px-3 py-1 text-xs text-white ${focusRing}`}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setDeleteError(false);
                      }}
                      className={`rounded-full px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => pickConversation(c.id)}
                      className={`min-w-0 flex-1 text-left ${focusRing}`}
                    >
                      <span className="block truncate text-sm">{c.title}</span>
                      <span className="block text-xs text-zinc-400">
                        {new Date(c.updated_at).toLocaleString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(c.id);
                        setDeleteError(false);
                      }}
                      aria-label={`Delete conversation ${c.title}`}
                      className={`rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 ${focusRing}`}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
      <div
        ref={bodyRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messagesState === "loading" || listState === "loading" ? (
          <p className="m-auto text-sm text-zinc-400">Loading...</p>
        ) : messagesState === "error" || listState === "error" ? (
          <p role="alert" className="m-auto text-sm text-red-300">
            Could not load your chat.
          </p>
        ) : messages.length === 0 && !waiting ? (
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
          {CHIPS.map((chip) =>
            chip === "Note" || chip === "Email" ? (
              <button
                key={chip}
                type="button"
                onClick={chip === "Note" ? showNotes : showEmail}
                className={`rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10 ${focusRing}`}
              >
                {chip}
              </button>
            ) : (
              <button
                key={chip}
                type="button"
                disabled
                title="Coming soon"
                className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500"
              >
                {chip}
              </button>
            ),
          )}
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
        </>
      )}
    </div>
  );
}
