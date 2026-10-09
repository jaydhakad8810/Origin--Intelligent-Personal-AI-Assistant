"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SIGN_IN_URL = `${API_URL}/v1/auth/google/login`;

// ── Theme ──────────────────────────────────────────────────────────────────

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    setTheme(
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
  }, []);

  function toggle() {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("origin.theme", next);
    } catch {}
  }

  return { theme, toggle };
}

// ── Animation wrapper ──────────────────────────────────────────────────────

function FadeRise({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

// ── SVG icons (inline stroke) ──────────────────────────────────────────────

function SunIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z" />
    </svg>
  );
}

function OrbIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="12 8 12 12 14 14" />
      <path d="M3.05 11a9 9 0 1 1 .5 4M3 21v-4h4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" />
      <polyline points="3 12 4 13 6 11" />
      <polyline points="3 18 4 19 6 17" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
      style={{ color: "var(--aurora-from)" }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
      style={{ color: "var(--aurora-via)" }}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg
      width="6"
      height="6"
      viewBox="0 0 6 6"
      fill="currentColor"
      aria-hidden="true"
      className="mt-1.5 shrink-0"
    >
      <circle cx="3" cy="3" r="3" />
    </svg>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    live: true,
    title: "Orb and chat",
    description: "A small glowing orb lives on your screen. Click it to open a chat panel and ask anything.",
    icon: <OrbIcon />,
  },
  {
    live: true,
    title: "Sign in with Google",
    description: "One-click sign in with your Google account. We only ask for your name and email.",
    icon: <PersonIcon />,
  },
  {
    live: true,
    title: "Chat history you control",
    description: "Your conversations are private to your account. Delete any chat at any time.",
    icon: <HistoryIcon />,
  },
  {
    live: false,
    title: "Calendar",
    description: "View and manage calendar events. You approve every action before it runs.",
    icon: <CalendarIcon />,
  },
  {
    live: false,
    title: "Gmail summaries",
    description: "Summarize any email with Origin on demand. Origin never sends mail on its own.",
    icon: <EnvelopeIcon />,
  },
  {
    live: false,
    title: "Tasks and reminders",
    description: "Create and track tasks and reminders just by asking.",
    icon: <TaskIcon />,
  },
  {
    live: false,
    title: "Notes and memory",
    description: "Origin only remembers what you explicitly ask it to. You can erase any memory.",
    icon: <NoteIcon />,
  },
  {
    live: false,
    title: "Voice and Hey Origin",
    description: "Optional voice activation. Off by default — you turn it on when you want it.",
    icon: <MicIcon />,
  },
];

const HOW_IT_WORKS = [
  {
    title: "Sign in",
    description: "Use your Google account. We ask for your name and email — nothing else.",
    icon: <KeyIcon />,
  },
  {
    title: "Meet the orb",
    description: "A small glowing orb appears on your screen. Drag it anywhere you like.",
    icon: <OrbIcon />,
  },
  {
    title: "Ask, then approve",
    description: "Ask Origin for anything. When it acts on your behalf, you decide first.",
    icon: <ChatIcon />,
  },
];

const PRIVACY_TODAY = [
  "Only your name and email are collected at sign in",
  "Your chats are private to your account",
  "Delete any conversation at any time",
];

const PRIVACY_ALWAYS = [
  "Gmail and Calendar access asked separately, only when you want them",
  "Origin never sends mail on its own",
  "Explicit memory only — you choose what it remembers, and you can erase it",
];

const ROADMAP = [
  {
    phase: "Now",
    items: ["Orb and text chat", "Google sign in", "Private chat history"],
  },
  {
    phase: "Next",
    items: ["Real AI answers", "Notes", "Explicit memory"],
  },
  {
    phase: "Then",
    items: ["Calendar", "Gmail summaries", "Tasks", "Reminders"],
  },
  {
    phase: "Later",
    items: ["Voice", "Hey Origin", "Mobile app", "Desktop app"],
  },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const { theme, toggle } = useTheme();

  const aurora = `linear-gradient(135deg, var(--aurora-from), var(--aurora-via), var(--aurora-to))`;

  function SignInButton({ size = "lg" }: { size?: "sm" | "lg" }) {
    return (
      <a
        href={SIGN_IN_URL}
        className={`inline-flex items-center gap-2 rounded-xl font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
          size === "lg"
            ? "min-h-[44px] px-6 py-3 text-base"
            : "min-h-[44px] px-4 py-2 text-sm"
        }`}
        style={{ background: aurora }}
      >
        <GoogleIcon />
        Sign in with Google
      </a>
    );
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* ── 1. Nav ─────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: "var(--card-border)",
          background: "var(--nav-bg)",
        }}
      >
        <nav
          className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 sm:px-6"
          aria-label="Main navigation"
        >
          <a
            href="#"
            className="flex min-h-[44px] items-center gap-2 rounded-lg px-2"
          >
            <Image
              src="/origin-logo.png"
              alt="Origin logo"
              width={30}
              height={30}
              className="rounded-full"
            />
            <span
              className="text-base font-semibold tracking-widest"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              ORIGIN
            </span>
          </a>

          <div className="ml-2 hidden items-center gap-1 sm:flex">
            {(
              [
                ["Features", "#features"],
                ["How it works", "#how-it-works"],
                ["Privacy", "#privacy"],
                ["Roadmap", "#roadmap"],
              ] as const
            ).map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--muted)" }}
              >
                {label}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              style={{ color: "var(--muted)" }}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="hidden sm:block">
              <SignInButton size="sm" />
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* ── 2. Hero ────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
            {/* Left column */}
            <div className="flex-1 text-center lg:text-left">
              <FadeRise>
                <span
                  className="mb-6 inline-block rounded-full border px-4 py-1.5 text-xs font-medium tracking-wide"
                  style={{
                    borderColor: "var(--card-border)",
                    color: "var(--muted)",
                  }}
                >
                  Early demo, invite only
                </span>
              </FadeRise>

              <FadeRise delay={0.05}>
                <h1
                  className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
                  style={{ fontFamily: "var(--font-sora, sans-serif)" }}
                >
                  Your day, handled by an assistant that{" "}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{ backgroundImage: aurora }}
                  >
                    answers to you.
                  </span>
                </h1>
              </FadeRise>

              <FadeRise delay={0.1}>
                <p
                  className="mb-8 text-base leading-relaxed sm:text-lg"
                  style={{ color: "var(--muted)" }}
                >
                  Origin is a personal AI assistant that lives on your screen as
                  a small glowing orb. Ask it anything, then let it help with
                  your calendar, mail and tasks. It only acts when you say so.
                </p>
              </FadeRise>

              <FadeRise delay={0.15}>
                <div className="flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                  <SignInButton size="lg" />
                  <a
                    href="#how-it-works"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-6 py-3 text-base font-medium transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                    style={{
                      borderColor: "var(--card-border)",
                      color: "var(--fg)",
                    }}
                  >
                    See how it works
                  </a>
                </div>
                <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
                  We only ask for your name and email at sign in. Nothing else.
                </p>
              </FadeRise>
            </div>

            {/* Right column: orb + preview card */}
            <FadeRise
              className="flex flex-1 flex-col items-center gap-6"
              delay={0.2}
            >
              {/* Big glowing orb */}
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute rounded-full blur-3xl"
                  style={{
                    width: "200px",
                    height: "200px",
                    background: aurora,
                    opacity: 0.35,
                  }}
                />
                <div className="origin-orb relative h-36 w-36 overflow-hidden rounded-full sm:h-44 sm:w-44">
                  <Image
                    src="/origin-logo.png"
                    alt="Origin orb"
                    fill
                    className="scale-[1.3] object-cover"
                    priority
                  />
                </div>
              </div>

              {/* Static preview chat card */}
              <div
                className="w-full max-w-sm rounded-[20px] border p-4"
                style={{
                  borderColor: "var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >
                <p
                  className="mb-3 flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Preview only — not a real conversation
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-end">
                    <div
                      className="max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white"
                      style={{ background: aurora }}
                    >
                      What should I focus on today?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div
                      className="max-w-[80%] rounded-2xl rounded-bl-sm border px-3 py-2 text-sm"
                      style={{
                        borderColor: "var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--fg)",
                      }}
                    >
                      Calendar and tasks are coming soon. For now, just ask me
                      anything.
                    </div>
                  </div>
                </div>
              </div>
            </FadeRise>
          </div>
        </section>

        {/* ── 3. Features ────────────────────────────────────── */}
        <section
          id="features"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
        >
          <FadeRise>
            <h2
              className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              Features
            </h2>
            <p
              className="mb-12 text-center text-sm"
              style={{ color: "var(--muted)" }}
            >
              What Origin can do today, and where it&apos;s heading.
            </p>
          </FadeRise>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <FadeRise key={f.title} delay={i * 0.04}>
                <div
                  className="flex h-full flex-col gap-3 rounded-[20px] border p-5"
                  style={{
                    borderColor: "var(--card-border)",
                    background: "var(--card-bg)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={
                        f.live
                          ? {
                              background: "rgba(56,189,248,0.12)",
                              color: "var(--aurora-from)",
                            }
                          : {
                              border: "1px solid var(--card-border)",
                              color: "var(--muted)",
                            }
                      }
                    >
                      {f.live ? "Live" : "Coming soon"}
                    </span>
                  </div>
                  <div style={{ color: "var(--aurora-from)" }}>{f.icon}</div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ fontFamily: "var(--font-sora, sans-serif)" }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    {f.description}
                  </p>
                </div>
              </FadeRise>
            ))}
          </div>
        </section>

        {/* ── 4. How it works ────────────────────────────────── */}
        <section
          id="how-it-works"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
        >
          <FadeRise>
            <h2
              className="mb-12 text-center text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              How it works
            </h2>
          </FadeRise>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <FadeRise key={step.title} delay={i * 0.1}>
                <div className="flex flex-col items-center gap-4 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border"
                    style={{
                      borderColor: "var(--card-border)",
                      background: "var(--card-bg)",
                      color: "var(--aurora-via)",
                    }}
                  >
                    {step.icon}
                  </div>
                  <div>
                    <div
                      className="mb-1 text-xs font-medium"
                      style={{ color: "var(--muted)" }}
                    >
                      Step {i + 1}
                    </div>
                    <h3
                      className="text-base font-semibold"
                      style={{ fontFamily: "var(--font-sora, sans-serif)" }}
                    >
                      {step.title}
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              </FadeRise>
            ))}
          </div>
        </section>

        {/* ── 5. Privacy and control ─────────────────────────── */}
        <section
          id="privacy"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
        >
          <FadeRise>
            <h2
              className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              Privacy and control
            </h2>
            <p
              className="mb-12 text-center text-sm"
              style={{ color: "var(--muted)" }}
            >
              You decide what Origin touches.
            </p>
          </FadeRise>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FadeRise delay={0.05}>
              <div
                className="h-full rounded-[20px] border p-6"
                style={{
                  borderColor: "var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >
                <h3
                  className="mb-5 text-base font-semibold"
                  style={{ fontFamily: "var(--font-sora, sans-serif)" }}
                >
                  Today
                </h3>
                <ul className="flex flex-col gap-4">
                  {PRIVACY_TODAY.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeRise>

            <FadeRise delay={0.1}>
              <div
                className="h-full rounded-[20px] border p-6"
                style={{
                  borderColor: "var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >
                <h3
                  className="mb-5 text-base font-semibold"
                  style={{ fontFamily: "var(--font-sora, sans-serif)" }}
                >
                  Always, as Origin grows
                </h3>
                <ul className="flex flex-col gap-4">
                  {PRIVACY_ALWAYS.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      <ShieldIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeRise>
          </div>
        </section>

        {/* ── 6. Roadmap ─────────────────────────────────────── */}
        <section
          id="roadmap"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
        >
          <FadeRise>
            <h2
              className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              Roadmap
            </h2>
            <p
              className="mb-12 text-center text-sm"
              style={{ color: "var(--muted)" }}
            >
              No dates. Just direction.
            </p>
          </FadeRise>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROADMAP.map((phase, i) => (
              <FadeRise key={phase.phase} delay={i * 0.08}>
                <div
                  className="h-full rounded-[20px] border p-5"
                  style={{
                    borderColor: "var(--card-border)",
                    background: "var(--card-bg)",
                  }}
                >
                  <span
                    className="mb-4 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: "rgba(139,92,246,0.12)",
                      color: "var(--aurora-via)",
                    }}
                  >
                    {phase.phase}
                  </span>
                  <ul className="flex flex-col gap-2">
                    {phase.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm"
                        style={{ color: "var(--muted)" }}
                      >
                        <span style={{ color: "var(--aurora-via)" }}>
                          <DotIcon />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeRise>
            ))}
          </div>
        </section>

        {/* ── 7. CTA ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <FadeRise>
            <h2
              className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-sora, sans-serif)" }}
            >
              Want to try it early?
            </h2>
            <p
              className="mb-8 text-sm leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Origin is invite-only right now. Sign in with Google to join the
              early demo.
            </p>
            <SignInButton size="lg" />
          </FadeRise>
        </section>
      </main>

      {/* ── 8. Footer ──────────────────────────────────────────── */}
      <footer
        className="border-t py-8 text-center"
        style={{ borderColor: "var(--card-border)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Origin. Early demo, invite only.
        </p>
      </footer>
    </div>
  );
}
