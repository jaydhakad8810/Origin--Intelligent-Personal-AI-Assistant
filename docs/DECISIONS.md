# Decisions

Approved decisions for Origin.

- Wake word "Hey Origin" wanted; works only while Origin tab open and mic allowed; visible mic indicator and mute; decided in Phase 2.
- Google Tasks holds tasks; Origin DB holds exact time and reminders.
- Many users: user_id on all data.
- Login: Google sign-in only.
- Long-term memory: explicit only, never automatic.
- LLM: Claude behind swappable gateway, with cost cap. STT/TTS: free browser speech first.
- Email: summarize only, no sending. "Summarize with Origin" button on each mail in Origin inbox view. Chrome extension for real Gmail page is a later phase.
- Language: English. Store UTC, show user time zone.
- Demo/test users only for now. Phase 9 added: public Gmail access (Google verification, privacy policy, security review).
- Hosting: Vercel free for web; free hosted Postgres with pgvector for DB (decide before Task 3). No Docker for now.
- Solo developer; one branch per task after first commit.
- Reminder delivery: browser/PWA push plus in-app.
