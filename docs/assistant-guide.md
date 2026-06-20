# Yolo Assistant — How to Use

The Yolo Assistant turns a messy brain-dump into a clean, scheduled set of tasks —
and helps you adjust your day in plain language. It **proposes**; you **approve**.
Nothing changes until you say so.

> Status: this guide covers **Phase 1** (shipped). Memory across sessions and
> proactive nudges are planned (Phases 2–3) and **not yet available**.

---

## 1. One-time setup: add an API key

The assistant runs on an LLM provider of your choice (bring your own key).

1. Open **Settings → AI**.
2. Pick a provider: **Claude (Anthropic)**, **OpenAI**, **Google Gemini**, or a
   **Custom** OpenAI-compatible endpoint.
3. Paste your API key. (Optional: set a specific model; the default for Claude is
   `claude-opus-4-8`.)

Without a key, the assistant panel will tell you one is needed.

---

## 2. Open the assistant

Click the **✨ floating button** in the bottom-right corner (or toggle the panel).
A side panel slides in with a message list and a composer at the bottom.

- **⌘↵ / Ctrl+↵** sends your message.
- **↵ (Enter)** inserts a new line — so you can paste long, multi-line text freely.

---

## 3. The headline feature: Paste → smart plan

This is the fastest way to get value.

1. **Paste anything** into the composer — meeting notes, an email, a list of
   to-dos, a rambling "stuff I need to do" dump.
2. When the text is long, a **✨ Plan this** button appears next to the composer
   hint. Click it (or just send normally).
3. Watch the **step trace** as the assistant works:
   - "Scanning your existing tasks…" — it checks for duplicates.
   - "Checking how long similar work takes…" — it sizes estimates from your history.
4. You get a **Proposed plan** — a group of task cards, each editable.

### What the assistant does for you automatically
- **Breaks the dump into well-scoped tasks** (aims for a tractable handful, not 30 trivia).
- **Deduplicates** — if something already exists in your tasks, it won't recreate it;
  it tells you which existing task it matched instead.
- **Categorizes** — assigns each task to an existing category, or **proposes a new
  project** when a theme emerges (the card shows `in new project "…"`).
- **Estimates** — seeds `estimated_minutes` from how long your similar work actually
  takes (calibrated from completed tasks).
- **Schedules** — spreads tasks across days by deadline and priority, or leaves them
  in the backlog when there's no implied timeframe.

### Approving the plan
- **Review/edit any card**, then approve it individually, **or**
- Click **Approve all** in the "Proposed plan — N tasks" header to apply every
  pending task at once.
- Approving a card with a new project creates that category for you.

---

## 4. Tell it about you ("About me")

In **Settings → AI** there's an **About me** box. Whatever you write there is read by
the assistant on **every** turn, so it tailors plans, estimates, and tone to your real
situation. It persists across restarts.

Good things to include:
- Your role and current projects ("PM relocating to Tokyo; Q3 launch is my focus").
- Working rhythm ("deep work in the mornings, meetings after 2pm").
- Goals and constraints ("learning Japanese 30 min/day", "no work on weekends").
- Vocabulary ("'the report' = the weekly investor update").

The more it knows, the less you have to re-explain. Edit it any time.

---

## 5. Everyday use (not just pasting)

Talk to it like a planning coach. Examples:

- "Move everything I didn't finish today to tomorrow."
- "What should I focus on next?"
- "Add a 30-minute task to call the bank, high priority, today."
- "Mark the report task done."
- "How did this week go?" (grounded in your real time data — see below.)

It proposes the matching changes as cards. Questions and advice come back as plain
replies with no cards.

### Actions it can propose
Create a task · Reschedule a task · Move a task to the backlog · Drop a task ·
Complete a task · Start a focus session on a task.

---

## 6. How approval works (propose-then-confirm)

- **Nothing is applied automatically.** Every change is a card you approve.
- **Destructive actions** (e.g. dropping a task) ask for an extra confirmation.
- You can **edit a card's fields** before approving, or dismiss it entirely.

---

## 7. Honest numbers

All metrics the assistant cites — estimate-vs-actual calibration, weekly time,
slips — are **computed deterministically by the app**, not made up by the model.
The model only narrates them. If there isn't enough history yet, it will hedge
("not much history yet") rather than over-claim.

---

## 8. Tips for the best results

- **Give it raw material.** The more context you paste, the better the plan. Don't
  pre-format — that's its job.
- **Mention deadlines in the text** ("by Friday", "due 2026-07-01") and it will
  schedule accordingly.
- **Name a project** if you have one in mind ("for the Tokyo move") — it'll group
  tasks under it, creating the project if needed.
- **Build history.** Estimates get sharper as you complete tasks and log focus time,
  because calibration has more to learn from.

---

## 9. Current limits (so you're not surprised)

- **Conversation is saved, but not yet *searched*.** Your **About me** and your **chat
  history** are remembered across restarts (the panel reopens where you left off).
  Proposals from a previous session show as already-handled, so nothing gets applied out
  of context. What's still missing: the assistant doesn't yet *semantically search* your
  full task/time history to pull in relevant past work. (Planned: Phase 2b-2 — recall.)
- **No proactive nudges yet.** It won't auto-plan your morning or warn about
  overcommitment on its own. (Planned: Phase 3.)
- **Pasted text only.** No screenshot/email/Slack import yet.
- **No live token streaming.** You see a step trace, then the full reply.
- **Dedup skips, it doesn't merge.** On a near-duplicate it declines to recreate and
  points you to the existing task, rather than merging details into it.

---

## 10. Troubleshooting

- **"Assistant needs an API key"** → add one in Settings → AI.
- **"The AI provider rejected your API key"** → re-check the key in Settings → AI.
- **"…is rate-limiting you"** → wait a moment and retry.
- **A proposed task looks wrong** → just edit the card before approving; the model's
  proposals are starting points, not final.
