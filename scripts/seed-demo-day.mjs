// One-off: generate SQL for a showcase "My Day" — precise tasks + focus
// sessions on an empty date, so every module (hero, timeline, donut, estimate,
// sessions, AI story) lights up. All rows are `demo-` prefixed for easy
// cleanup. Local wall-clock times are converted to the UTC-Z format the app
// stores, so they display exactly as written.
//
//   node scripts/seed-demo-day.mjs > /tmp/yolo-demo-day.sql

const DATE = "2026-05-29"; // Friday, confirmed empty in the DB
const [Y, MO, D] = DATE.split("-").map(Number);

/** Local wall-clock (HH:MM that day) -> UTC ISO string the app stores. */
function iso(hh, mm) {
  return new Date(Y, MO - 1, D, hh, mm, 0, 0).toISOString();
}
const CREATED = iso(8, 0);

function esc(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ── Tasks ────────────────────────────────────────────────────────────────────
// estimated_minutes are honest pre-day guesses; actuals (sessions) run a bit
// over so "estimate vs reality" shows a real +drift.
const tasks = [
  { id: "demo-t1", title: "Ship daily debrief feature", category_id: "development", status: "done", priority: "high", est: 100, completedAt: iso(21, 25) },
  { id: "demo-t2", title: "Polish My Day timeline UI", category_id: "development", status: "done", priority: "high", est: 70, completedAt: iso(15, 0) },
  { id: "demo-t3", title: "Tailor résumé for Stripe application", category_id: "job-hunting", status: "done", priority: "medium", est: 30, completedAt: iso(11, 5) },
  { id: "demo-t4", title: "JLPT N2 grammar drills", category_id: "japanese", status: "done", priority: "medium", est: 40, completedAt: iso(11, 55) },
  { id: "demo-t5", title: "DDIA ch.5 — Replication", category_id: "reading", status: "done", priority: "low", est: 45, completedAt: iso(16, 0) },
  { id: "demo-t6", title: "Morning run + mobility", category_id: "health", status: "done", priority: "medium", est: 25, completedAt: iso(7, 45) },
  { id: "demo-t7", title: "Refactor settings store", category_id: "development", status: "dropped", priority: "medium", est: 45, droppedAt: iso(18, 30) }
];

// ── Focus sessions ───────────────────────────────────────────────────────────
const sessions = [
  { id: "demo-e1", task: "demo-t6", s: [7, 10], e: [7, 45], note: "Easy 5K along the river, then 10-min mobility. Cleared my head before the desk.", completion: 100 },
  { id: "demo-e2", task: "demo-t1", s: [8, 30], e: [10, 5], note: "Wired the debrief runner + repository; multi-provider BYO-key path working end to end.", next: "Generalise the runner so any past day can generate.", completion: 90 },
  { id: "demo-e3", task: "demo-t3", s: [10, 20], e: [11, 5], note: "Rewrote impact bullets and quantified two projects with real numbers.", blocker: "Still need a referral contact at Stripe.", completion: 75 },
  { id: "demo-e4", task: "demo-t4", s: [11, 10], e: [11, 55], note: "20 N2 grammar points — 〜ばかりに, 〜とはいえ, 〜ながらも. Nuance still shaky.", completion: 65 },
  { id: "demo-e5", task: "demo-t2", s: [13, 30], e: [15, 0], note: "Hour-axis timeline + category donut with a framer-motion reveal. Feels premium.", next: "Tune the empty and no-key states.", completion: 85 },
  { id: "demo-e6", task: "demo-t5", s: [15, 15], e: [16, 0], note: "Leader–follower replication, replication lag, read-your-writes consistency.", completion: 100 },
  { id: "demo-e7", task: "demo-t1", s: [20, 30], e: [21, 25], note: "Evening push: saved the hand-tuned debrief and fixed a -0 dashOffset bug in the donut.", completion: 100 }
];

const lines = [];
lines.push("BEGIN;");

for (const t of tasks) {
  const completedAt = t.completedAt ?? null;
  const droppedAt = t.droppedAt ?? null;
  const updatedAt = completedAt ?? droppedAt ?? CREATED;
  lines.push(
    `INSERT INTO tasks (id, title, description, category_id, status, priority, estimated_minutes, due_date, created_at, updated_at, completed_at, dropped_at) VALUES (` +
      [
        esc(t.id),
        esc(t.title),
        "NULL",
        esc(t.category_id),
        esc(t.status),
        esc(t.priority),
        t.est,
        esc(DATE),
        esc(CREATED),
        esc(updatedAt),
        esc(completedAt),
        esc(droppedAt)
      ].join(", ") +
      `);`
  );
}

for (const e of sessions) {
  const start = iso(e.s[0], e.s[1]);
  const end = iso(e.e[0], e.e[1]);
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  lines.push(
    `INSERT INTO time_entries (id, task_id, start_at, end_at, duration_seconds, note, blocker, next_action, completion_rate, created_at, updated_at) VALUES (` +
      [
        esc(e.id),
        esc(e.task),
        esc(start),
        esc(end),
        duration,
        esc(e.note ?? null),
        esc(e.blocker ?? null),
        esc(e.next ?? null),
        e.completion ?? "NULL",
        esc(start),
        esc(end)
      ].join(", ") +
      `);`
  );
}

lines.push("COMMIT;");
process.stdout.write(lines.join("\n") + "\n");
