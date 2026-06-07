# Yolo Theme — Design Spec

**Date:** 2026-06-07
**Status:** Approved for Phase 1 build
**Topic:** YOLO-themed design, interactions, and UX for the Yolo desktop app

---

## 1. Intent

Yolo ("you only live once") is an AI-native desktop productivity app whose
throughline is **"Make your time count"** — turning tasks into honest time
records. This work makes the *name* felt in the product: it adds a thin layer of
theme, motion, and voice that reinforces finitude and earned progress, without
turning an honest time-tracker into a gamified toy.

This is **not** a redesign. It plugs into the existing Linear-style "soft modern"
system (Tailwind tokens, Radix, framer-motion) and the focus-stage architecture
already present in `CurrentFocus.tsx` (which includes a documented ambient-scene
slot and a breathing aura).

### Emotional direction: **Dynamic**

The app is **calm and weighted at rest, and joyful only when joy is earned.**
- *Gravity* — finite time, quiet urgency, honesty.
- *Celebration* — a real reward beat when you actually spend time well.

The asymmetry between these two is the personality. We do not sprinkle theme
everywhere; we place it at a few high-leverage moments.

---

## 2. Scope

### Phase 1 — The Focus Loop, with weight & payoff *(this spec, build now)*

A single coherent flow — **commit → focus → celebrate** — wrapped in finitude
and a consistent voice.

1. **Commit moment** — starting a focus feels like a small vow.
2. **Focus-complete celebration** — the earned reward beat on *Mark as done*.
3. **Week-of-life thread** — a quiet finitude line on Today, linking to Life.
4. **Voice & microcopy** — honest/bold/warm rewrites of key strings.
5. **Motion language** — two reusable primitives (`settle`, `celebrate`).

### Phase 2 — The reflective layer *(roadmap, design later)*

- Life page elevated into the emotional anchor.
- Daily intent prompt ("the one thing that matters today").
- "Days you made count" streak (meaning, not guilt).

### Phase 3 — Delight polish *(roadmap)*

- Task-done micro-interaction.
- Milestone surprises (first focus, longest session, 100h tracked).
- Optional sound on commit/complete (off by default).

### Out of scope

- "Honest day mirror" end-of-day review (explicitly deselected).
- Any privacy/local-first framing (counter to product positioning).
- New dependencies — everything builds on framer-motion + existing tokens.

---

## 3. Phase 1 Design

### 3.0 Motion language (foundation — build first)

Two named motion primitives, reused by every other piece. This is what makes the
theme cohere instead of feeling like scattered effects. Both build on the
existing `--ease-spring` token and framer-motion; **no new deps**.

| Primitive | Feel | Curve / timing | Used by |
|---|---|---|---|
| `settle` | Rest / gravity. Arrives and comes to rest. **No overshoot.** | ease-out, ~360ms | commit ignite, panel/page entrances, life thread reveal |
| `celebrate` | Earned joy. One overshoot, brief. | `cubic-bezier(.34,1.56,.64,1)`, ~600ms | focus-complete burst; later task-done / milestones |

**Deliverable:** a small motion module (e.g. `src/utils/motion.ts` or a set of
framer-motion variants) exporting `settle` and `celebrate` transitions, plus any
keyframes added to `tailwind.config`/`styles.css`. All later pieces import these
rather than hand-rolling timings.

**Accessibility:** all motion must respect `prefers-reduced-motion`. Under
reduced motion, `celebrate` degrades to a simple opacity/colour change (no
overshoot, no particles) and `settle` degrades to an instant/!near-instant fade.
Follow the existing `motion-safe:` pattern already used in `CurrentFocus.tsx`.

### 3.1 Commit moment

Starting a focus is framed as a small vow, not a button press. **Non-blocking** —
it plays *on the focus stage itself*, not in a modal.

When a focus session starts (a task becomes the focused/active task):
- The breathing aura **breathes in** (`settle`): scales from ~0.7 → 1.0, opacity
  ramps up then settles to its resting glow.
- The orb **settles** into focus (`settle`): a subtle scale-from-0.86 + opacity.
- A one-line **whisper** fades in and out over ~3s, centered below the orb:
  > *"The next N minutes are yours."*
  where N is the task estimate in minutes; if there is no estimate, fall back to
  a generic line (e.g. *"This block is yours."*).

The whisper is decorative and transient (it must not occupy permanent layout or
shift the timer). It plays once per session start, not on resume from pause.

**Asymmetry note:** this is intentionally the *calm* bookend. It uses `settle`,
never `celebrate`.

### 3.2 Focus-complete celebration — **Intensity B (Confident burst)**

The emotional peak of the app. Today, *Mark as done* in `StopSessionDialog`
closes the dialog silently. We add an earned reward beat.

On **Mark as done** (outcome `"done"`), after the save succeeds:
- The progress ring **snaps to full** (`celebrate`).
- A warm radial **burst glow** (brand orange→violet) blooms and settles.
- ~10 **sparks** fly outward radially from the orb center and fade.
- The orb **overshoots once** and settles (`celebrate`).
- Copy: **"{duration}. Made it count."** (e.g. "32m. Made it count.") using the
  real tracked focus time for that session.

Calibration: **confident, not confetti-cannon.** Brief (~0.8–1.2s), then the UI
returns to rest. Explicitly *not* Intensity C (confetti rain / max dopamine),
which risks feeling gamified and cheap over repeated use.

Scope guard: the celebration fires **only on `"done"`**, not on `"paused"` or
`"dropped"`. Pausing and dropping stay quiet and neutral.

**Open implementation question:** where the celebration renders. Two candidates,
to be decided in the implementation plan:
- (a) inside the wrap-up dialog as a transient success state before it closes, or
- (b) on the focus card/stage as the dialog closes.
Either way it reuses the orb + ring visual language already in `CurrentFocus.tsx`.

### 3.3 Week-of-life thread — **Full framing**

A single quiet line at the top of the Today surface:

> **Week 1,487 of ~4,000**

- Derived from existing settings (`birthDate`, `lifeExpectancyYears`) via the
  same math the Life page uses (`computeLifeProgress` / `lifeWeeks` utils). Reuse
  those utilities — do not recompute independently.
- **Clickable** → navigates to the Life page.
- Reveals with `settle` on mount; otherwise static and unobtrusive.
- **Empty/unset state:** if `birthDate` is not configured, show a soft prompt
  instead (e.g. *"Set your birthday to see your life in weeks"* linking to Life
  setup), never a broken/NaN line.

This is the heaviest, most honest framing (it shows the whole arc), chosen
deliberately to match the "honest time records" spine.

### 3.4 Voice & microcopy

The Dynamic voice: **honest, a little bold, warm — never guilt-trips, never
corny.** Gravity lines are quiet and factual; celebration lines are warm and
earned. Never "Crush your goals!! 🚀".

Load-bearing rewrites (a fuller string pass is an implementation task):

| Where | Now | YOLO voice |
|---|---|---|
| App subtitle (`App.tsx`) | "Turn tasks into time records." | **"Make your time count."** |
| Empty focus (`CurrentFocus.tsx`) | "No active focus session" | **"Nothing running — your time's just ticking."** |
| Wrap-up title (`StopSessionDialog.tsx`) | "Wrap up this session" | **"What did this time buy you?"** |
| Done celebration | *(silent)* | **"{duration}. Made it count."** |
| Commit whisper | *(none)* | **"The next N minutes are yours."** |

Constraint: keep copy short enough not to break existing layouts (buttons,
narrow focus-control panes). Verify against the `.focus-controls` collapse
behavior noted in `CurrentFocus.tsx`.

---

## 4. Units & boundaries

Each piece is small and independently understandable:

- **Motion module** — exports `settle` / `celebrate`. Depends on: framer-motion,
  tokens. Consumed by all visual pieces. Testable: pure config.
- **Commit moment** — a self-contained effect on the focus stage, triggered by
  "session started". Depends on: motion module, timer/task store state. Does not
  change focus logic; only presentation.
- **Celebration** — a self-contained reward component, triggered by a successful
  `"done"`. Depends on: motion module, the session's tracked duration. Reuses the
  orb/ring visuals.
- **Life thread** — a small presentational component fed by existing life-weeks
  utilities + a navigate callback. No new data layer.
- **Voice** — string changes at known call sites. No structural coupling.

A consumer can understand each unit without reading the others' internals;
changing the motion curves should not require touching the thread or voice.

---

## 5. Error handling & edge cases

- **No estimate:** commit whisper and any "N minutes" copy must have a graceful
  generic fallback.
- **Birthday unset:** life thread shows a setup prompt, never NaN/"Week NaN".
- **Reduced motion:** `celebrate` and `settle` degrade gracefully (§3.0).
- **Rapid done / double-submit:** celebration must not double-fire or block the
  dialog's existing `saving` guard; it triggers only on confirmed success.
- **Very long sessions / "over by" state:** duration copy reuses existing
  `formatDurationCompact` so formatting stays consistent.

---

## 6. Testing

Per project conventions (`yarn build`, `yarn test` / vitest):

- **Unit:** motion module exports the expected transitions; life-thread copy
  renders the right week numbers from given settings; birthday-unset renders the
  prompt; duration copy formats via the shared util.
- **Component:** celebration fires on `"done"` only (not `"paused"`/`"dropped"`);
  commit whisper renders on start and not on resume; reduced-motion path renders
  without particle/overshoot nodes.
- **Manual / visual:** the three live mockups in
  `.superpowers/brainstorm/` are the reference for feel (commit ignite,
  Intensity B burst, Full thread).
- Maintain the project's existing coverage bar; no Rust changes expected, so no
  `cargo check` impact anticipated.

---

## 7. Roadmap (Phases 2 & 3)

Documented for continuity; **not** built in Phase 1. Each gets its own
spec → plan → implementation cycle later, and will reuse the `settle` /
`celebrate` motion primitives and the established voice.

- **Phase 2:** Life page as anchor · daily intent prompt · "days you made count".
- **Phase 3:** task-done micro-interaction · milestone surprises · optional sound.

---

## 8. Decisions locked (provenance)

| Decision | Choice | Why |
|---|---|---|
| Tone | Dynamic (C) | Honest *and* alive; keeps the product honest |
| Celebration intensity | B — Confident burst | Earned joy without gamification |
| Commit moment | Orb ignite + whisper (`settle`) | Calm bookend to B |
| Life thread framing | Full — "of ~4,000" | Most honest; matches positioning |
| Voice | Honest/bold/warm | Reinforces "make your time count" |
| Scope | Focus loop only in P1 | One coherent flow > scattered effects |
