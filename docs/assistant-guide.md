# Yolo Assistant — How to Use

The Yolo Assistant turns a messy brain-dump into a clean, scheduled set of tasks —
and helps you adjust your day in plain language. It can operate on your tasks
directly, with autonomy controls in **Settings → AI**.

> Status: this guide covers the shipped in-app tool-calling assistant: task
> tools, memory, retrospective context, permission levels, and session revert.

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
4. You get a concise reply plus tool-call rows showing what changed or what
   needs approval.

### What the assistant does for you automatically
- **Breaks the dump into well-scoped tasks** (aims for a tractable handful, not 30 trivia).
- **Deduplicates** — if something already exists in your tasks, it won't recreate it;
  it tells you which existing task it matched instead.
- **Categorizes** — assigns each task to an existing category, or creates a new
  category when a theme emerges and your autonomy level allows it.
- **Estimates** — seeds `estimated_minutes` from how long your similar work actually
  takes (calibrated from completed tasks).
- **Schedules** — spreads tasks across days by deadline and priority, or leaves them
  in the backlog when there's no implied timeframe.

### Autonomy levels

Set **Assistant autonomy** in **Settings → AI**:

- **Plan** — the assistant can read context, but every write appears as a pending
  card for you to apply.
- **Ask** — same confirmation behavior as Plan, useful when you want explicit
  review on each change.
- **Auto** — reversible writes apply immediately and render as **Done** with a
  **Revert** button. Destructive writes, such as dropping a task, still require
  confirmation.

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

> **About me vs Soul.** *About me* is about **you** — your role, projects, and goals.
> The **Soul** (next section) is about **the assistant** — who it is and how it behaves.

---

## 5. Give it a Soul (identity, voice, boundaries)

In **Settings → AI** there's an **Assistant name** field and a **Soul** editor. Together
they define *who your assistant is* — separate from *About me*, which is about you.

- **Assistant name** — what it's called (default: "Yolo Assistant"). The name is woven
  into how it introduces and refers to itself.
- **Soul** — a short markdown identity block. It becomes **slot #1 of the system prompt**,
  the first thing the model reads, and it **replaces** the old hardcoded "day-planning
  companion" identity. So the assistant is no longer locked to one workflow — it can be
  whatever operator you want it to be.

**Leave the Soul blank and a shipped default (`DEFAULT_SOUL`) is used** — a capable,
broadly-skilled operating partner. Click **Reset to default soul** to drop that default
into the editor so you can tweak it.

A good Soul covers four short sections:
- **Identity** — who it is and what it's for.
- **Style** — how it talks (e.g. "warm, direct, brief").
- **Avoid** — what it must never do (e.g. "never nag", "never invent numbers").
- **Defaults** — how to handle broad or under-specified requests.

The Soul changes the assistant's *voice and judgment* — it never gives it new powers.
Every product guardrail still holds: it uses validated tools, destructive changes
confirm first, and it can't invent tasks or numbers (see §7 and §8).

---

## 6. Everyday use (not just pasting)

Talk to it like a planning coach. Examples:

- "Move everything I didn't finish today to tomorrow."
- "What should I focus on next?"
- "Add a 30-minute task to call the bank, high priority, today."
- "Mark the report task done."
- "How did this week go?" (grounded in your real time data — see below.)

It uses tool-call rows for matching changes. Questions and advice come back as
plain replies with no tool rows.

### Proactive day sense
Open the assistant and a **briefing bar** at the top tells you today's shape at a glance —
e.g. _"Overcommitted — 5h scheduled vs your 4h target"_ or _"Nothing scheduled today — 6 in
your backlog"_ — with one button (**Plan my day** / **Trim my day** / **Fill from backlog**).
It's computed instantly from your tasks (no AI call to show it); the button hands off to the
assistant.

The assistant also knows this load mid-conversation — how much you've scheduled versus your
**daily focus target** (Settings → AI), plus what's open, done, and waiting in the backlog.
So it can:
- **Warn when you're overcommitted** ("you've packed 6h into a 4h target — defer the
  lowest-priority task?").
- **Offer to fill a light or empty day** from the backlog.
- **Plan your day within your target** — just say "Plan my day".

It follows your autonomy level. It nudges, it doesn't nag.

### Recall — ask about your past work
When you log notes, blockers, or next-actions during focus sessions, the assistant can
search them. Ask things like:
- "What blocked me last time I worked on the launch?"
- "What did I learn from the last report?"
- "What keeps slowing down my Japanese practice?"

It pulls the relevant dated notes from your history and grounds its answer in them.
(Keyword match — use words you'd have written in the notes.)

### Editing existing tasks
Beyond creating tasks, the assistant can **edit ones you already have**. Ask it to
change a task's **title**, **description**, **category**, **priority**, or **estimate**
("rename the report task", "make the launch task high priority", "put the Anki task in
the Japanese project"). It can also edit **planned start/end times**, so requests like
"delay today's tasks by 30 minutes" update real schedule fields instead of creating a
placeholder task. If you name a project that doesn't exist yet, the tool can create it.

### Bulk operations
For "do this to all of them" requests — **"delay today's tasks 30 minutes"**,
**"categorize everything"**, **"re-prioritize my backlog"** — the assistant first
lists the relevant set, then calls the appropriate write tool per task. In Auto,
safe bulk edits execute and can be reverted one by one; in Plan/Ask, they queue as
pending rows.

### Tools it can use
Read tasks · Search tasks · List categories · Read calibration/history · Create a
task · **Edit a task** (title/description/category/priority/estimate/date/planned
times/status) · Move a task to the backlog · Drop a task · Complete a task · Start
or pause focus.

---

## 7. How approval and revert work

- **Plan/Ask:** every write is pending until you apply it.
- **Auto:** reversible writes apply immediately and show **Done**.
- **Destructive actions** (e.g. dropping a task) always require confirmation.
- **Revert:** executed reversible writes include a Revert control. If the task was
  edited after the assistant changed it, Yolo asks before restoring the older snapshot.

---

## 8. Honest numbers

All metrics the assistant cites — estimate-vs-actual calibration, weekly time,
slips — are **computed deterministically by the app**, not made up by the model.
The model only narrates them. If there isn't enough history yet, it will hedge
("not much history yet") rather than over-claim.

---

## 9. Tips for the best results

- **Give it raw material.** The more context you paste, the better the plan. Don't
  pre-format — that's its job.
- **Mention deadlines in the text** ("by Friday", "due 2026-07-01") and it will
  schedule accordingly.
- **Name a project** if you have one in mind ("for the Tokyo move") — it'll group
  tasks under it, creating the project if needed.
- **Build history.** Estimates get sharper as you complete tasks and log focus time,
  because calibration has more to learn from.

---

## 10. Current limits (so you're not surprised)

- **Recall is keyword-based, not semantic.** The assistant can pull up past work from your
  logged notes/blockers (see "Recall" below), but it matches on **keywords**, not meaning —
  so phrase your question with words you'd have used in the notes. (A future upgrade could
  add semantic/embedding search.)
- **Briefing is in-app, not scheduled.** The briefing bar shows whenever you open the
  assistant, but nothing yet *pushes* a morning notification or runs an automatic end-of-day
  review on a timer. (A future upgrade could tie this into the existing daily-debrief
  schedule.)
- **Pasted text only.** No screenshot/email/Slack import yet.
- **No live token streaming.** You see a step trace, then the full reply.
- **Dedup skips, it doesn't merge.** On a near-duplicate it declines to recreate and
  points you to the existing task, rather than merging details into it.

---

## 11. Troubleshooting

- **"Assistant needs an API key"** → add one in Settings → AI.
- **"The AI provider rejected your API key"** → re-check the key in Settings → AI.
- **"…is rate-limiting you"** → wait a moment and retry.
- **A pending change looks wrong** → dismiss it and ask for the exact correction.
