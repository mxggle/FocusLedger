# Inside Yolo's AI Engine — A Technical Architecture Review

> A detailed walkthrough of how Yolo's AI features are designed, from the
> provider clients that talk to language models all the way up to the
> propose‑then‑confirm cards you click to approve a change.
>
> Yolo is an **AI‑native desktop productivity app**. Its job is to help you
> *do* your tasks and see where your time actually goes — turning plans into
> honest time records under one throughline: **make your time count.** This
> document explains the engineering that makes the AI half of that promise work.

---

## Table of contents

1. [The big picture](#1-the-big-picture)
2. [How a single message travels through the system](#2-how-a-single-message-travels-through-the-system)
3. [Talking to the models: the provider layer](#3-talking-to-the-models-the-provider-layer)
4. [The agent loop: thinking in steps](#4-the-agent-loop-thinking-in-steps)
5. [The tool system: giving the model hands](#5-the-tool-system-giving-the-model-hands)
6. [Propose‑then‑confirm: safety as a first‑class feature](#6-propose-then-confirm-safety-as-a-first-class-feature)
7. [The sandbox: running model‑written code safely](#7-the-sandbox-running-model-written-code-safely)
8. [Context building: what the model actually sees](#8-context-building-what-the-model-actually-sees)
9. [Memory and skills: two learning loops](#9-memory-and-skills-two-learning-loops)
10. [Retrospective analytics: compute the numbers, narrate the story](#10-retrospective-analytics-compute-the-numbers-narrate-the-story)
11. [State and UI: streaming, cards, and the dock](#11-state-and-ui-streaming-cards-and-the-dock)
12. [The MCP server: opening Yolo to other agents](#12-the-mcp-server-opening-yolo-to-other-agents)
13. [Cross‑cutting engineering: testing, time, safety, immutability](#13-cross-cutting-engineering-testing-time-safety-immutability)
14. [Design principles that hold the whole thing together](#14-design-principles-that-hold-the-whole-thing-together)
15. [Honest trade‑offs and where the complexity lives](#15-honest-trade-offs-and-where-the-complexity-lives)

---

## 1. The big picture

Yolo's assistant is not a chat window bolted onto a to‑do list. It is a small,
disciplined **agent runtime** built entirely in TypeScript on the renderer side
of a Tauri v2 desktop app, with provider HTTP calls tunneled through the Tauri
HTTP plugin so they reach Anthropic, OpenAI, and Google directly.

The system is organized as a clean pipeline. Each layer does exactly one job and
hands off through a well‑defined boundary, which is why almost every module has a
co‑located test and most files stay between 30 and 250 lines.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ UI LAYER  src/components/assistant/                                        │
│   AssistantDock · MessageList · Composer · MessageRow · ToolCallCard       │
│   ReasoningPanel · BriefingBanner · SlashCommandMenu · useDayBriefing      │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ send / stop / regenerate / applyToolCall / revert
┌───────────────▼──────────────────────────────────────────────────────────┐
│ STATE / ORCHESTRATION  src/stores/assistantStore.ts (Zustand)             │
│   runStreamFrom() · streaming placeholder lifecycle · apply-all batching   │
│   memory + skill review scheduling · insights/history/memory/skill caches  │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ runAssistantToolTurn(input, deps)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ RUNNER  assistant/assistantRunner.ts                                       │
│   capture local timestamp → buildAssistantContext → buildSystemPrompt      │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ runToolLoop(...)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ AGENT LOOP  assistant/toolLoop.ts   (MAX_STEPS = 12, temperature 0.3)      │
│   generate → parse tool calls → reads (parallel) / writes (sequential)     │
│   → permission gate → execute or queue → feed results back → reflect        │
│   ├── clarify          → ends the turn with a question                      │
│   ├── execute_program  → ptc/sandbox.ts (QuickJS VM) via registryBridge     │
│   └── native/JSON calls → agentTools registry                               │
└──────┬───────────────────────────────┬────────────────────────────────────┘
       │                               │
┌──────▼─────────────┐     ┌───────────▼───────────────────────────────────┐
│ PROVIDER CLIENTS   │     │ TOOL REGISTRY  agentTools/registry.ts          │
│ providers.ts       │     │  read tools | write tools | clarify            │
│ aiClient (1-shot)  │     │  zod schemas · execute() · undo ops            │
│ chatClient (chat + │     │        │ storeAdapter → useTaskStore           │
│   streamChatV2 SSE)│     └────────┴───────────────────────────────────────┘
└────────────────────┘
```

Three satellite subsystems orbit this core:

- **`src/services/retrospect/`** — deterministic analytics (estimate‑vs‑actual
  calibration, slip and blocker analysis, weekly review). It computes the
  numbers; the model only narrates them.
- **`assistant/memory/` and `assistant/skills/`** — two background learning
  loops that fold durable facts about the user, and reusable procedures, into
  future prompts.
- **`mcp/`** — a standalone Model Context Protocol server that exposes the same
  task database to external agents like Claude Desktop and Cursor.

---

## 2. How a single message travels through the system

Everything starts when you type into the composer and press send. Here is the
full lifecycle, orchestrated by `runStreamFrom` in `assistantStore.ts`:

1. **Append and persist.** Your message is added to the conversation, the status
   flips to `thinking`, and the message is written to the local message
   repository.
2. **Load session caches.** Retrospective insights, conversation history,
   memories, skills, and prior conversations are loaded — each cached for the
   session and fetched best‑effort, so a failure degrades to an empty list
   rather than a crash.
3. **Rank what's relevant.** The last thing you said is scored against stored
   memories (top 8) and skills (top 5), and the winners are folded into a
   snapshot for this turn.
4. **Build context and the system prompt.** The runner captures a local
   timestamp (with timezone offset), assembles an `AssistantContext` from a
   snapshot of your tasks and schedule, then composes the system prompt.
5. **Run the agent loop.** The model generates, the loop detects any tool calls,
   runs reads in parallel and writes sequentially through a permission gate,
   feeds the results back as a synthetic turn with a reflection nudge, and
   repeats — up to 12 steps — until the model produces a final answer.
6. **Stream to the UI.** Tokens build a live placeholder bubble; a dedicated
   signal discards that placeholder when the model is mid‑reasoning so raw tool
   JSON never leaks into the answer; the reasoning trace feeds the collapsible
   thinking panel.
7. **Finalize.** The placeholder is replaced with the authoritative reply, the
   message is persisted, and the task store is refreshed if any write executed.
8. **Learn in the background.** Debounced and fire‑and‑forget, two review jobs
   run on an auxiliary model to extract new memories and skills from the turn.

```
User    Composer  assistantStore   runner/loop   provider   registry/store   UI cards
 │  type   │           │               │            │            │              │
 ├─send───►│           │               │            │            │              │
 │         ├─send()───►│ append+persist │            │            │              │
 │         │           ├ load caches (insights/history/memory/skill/convos)     │
 │         │           ├ rank mem/skill, build snapshot           │             │
 │         │           ├─runAssistantToolTurn──► build ctx+prompt │             │
 │         │           │               ├─generate(stream)────────►│             │
 │         │           │◄──onStep / onToken (ReasoningPanel + bubble)            │
 │         │           │               │◄─tool_calls──────────────┤             │
 │         │           │               ├ reads in parallel ──────►│ getAllTasks │
 │         │           │               ├ writes sequential → gate │             │
 │         │           │               │   ├ auto+reversible─────►│ execute+undo│
 │         │           │               │   └ destructive / ask───────────────►queue pending
 │         │           │               ├ feed results + reflect ─►│             │
 │         │           │               │  (repeat ≤ 12 steps)     │             │
 │         │           │◄─final reply──┤                          │             │
 │         │           ├ finalize bubble, persist, refresh store  │             │
 │         │           ├ scheduleMemoryReview / scheduleSkillReview (background) │
 │◄────────┴───────────┤ render answer + tool cards ──────────────┴────────────►│
 │  click Apply ───────► applyAllToolCalls (fixed-point retry) ──► execute ─────► highlightTask
```

---

## 3. Talking to the models: the provider layer

Three small files own everything about speaking to language models, and they are
strictly separated by responsibility:

- **`providers.ts`** is pure. It knows the wire format of every provider but does
  no I/O. It builds one‑shot requests, multi‑turn chat requests (with streaming
  and tools), and parses responses.
- **`aiClient.ts`** does one‑shot generation (used by the end‑of‑day debrief) and
  exposes `hasAiKey`, the gate every AI call checks first.
- **`chatClient.ts`** does multi‑turn chat — both a non‑streaming path and the
  streaming `streamChatV2`, which also accumulates native tool calls.

**Providers supported:** Anthropic, OpenAI, Google Gemini, and a `custom`
OpenAI‑compatible endpoint (for local models such as Ollama). Sensible default
models are configured (`claude-opus-4-8`, `gpt-5.1`, `gemini-2.5-flash`), and a
blank model field falls back to the default automatically.

Each provider has a genuinely different request shape, and the builder handles
all of them: Anthropic's `/v1/messages` with `input_schema` tools, OpenAI's
`/chat/completions` with function tools and `tool_choice: "auto"`, and Gemini's
`:generateContent` with `systemInstruction`, role remapping (`assistant → model`),
and `functionDeclarations`.

### Streaming, done carefully

`streamChatV2` handles three different server‑sent‑event dialects with
per‑provider accumulators — OpenAI's indexed `tool_calls` deltas, Anthropic's
content‑block lifecycle with concatenated `partial_json`, and Gemini's
`functionCall` parts. The robustness details are what make it production‑grade:

- If the response body isn't a usable stream, it **falls back to a single
  non‑streamed read** instead of failing.
- On user abort, it **resolves with whatever it accumulated** rather than
  throwing — so a stopped generation still surfaces partial work.
- It flushes the trailing partial SSE line, and tolerates malformed tool‑argument
  JSON by returning an empty object instead of crashing.

### Bring your own key, with friendly failure

Keys live in settings and are checked by `hasAiKey` before any request. Calls go
through the Tauri HTTP plugin specifically so provider APIs that reject
browser‑origin requests still work — there is no proxy or middleman server; it is
fully direct‑to‑provider. Errors are centralized and translated into plain
language: a 401/403 becomes "the provider rejected your API key," a 429 becomes
"the provider is rate‑limiting you," and a network failure becomes "could not
reach the AI provider."

---

## 4. The agent loop: thinking in steps

The heart of the assistant is `toolLoop.ts` — a compact, provider‑neutral
implementation of the **ReAct pattern** (reason, act, observe, repeat). Its
constants tell you a lot about the design intent: at most **12 steps**, a low
**temperature of 0.3** for deliberate tool use, an **8‑second** program timeout,
and a **60‑call** ceiling inside the sandbox.

Each step does the following:

1. Check for an abort, then generate — preferring the streaming path, falling
   back to non‑streaming if needed.
2. Determine the tool calls. If the provider returned native tool calls, use
   them; otherwise parse a `{tool_calls: [...]}` JSON object out of the text.
   This dual path is why the system prompt also documents a JSON fallback format
   — it lets providers without native tool calling still drive the agent.
3. Handle special cases: a `clarify` call ends the turn with a question, and an
   `execute_program` call runs the sandbox.
4. Otherwise, execute the calls. **Reads run in parallel** because they have no
   side effects; **writes run sequentially** because they can collide.
5. Each write is validated, summarized for display, and either queued as a
   pending confirmation card or executed immediately — recording an undo
   operation either way.
6. All results are fed back to the model as a synthetic turn, accompanied by a
   **reflection nudge** that adapts to what happened: if a call failed, the model
   is told not to repeat the same failing call; if everything succeeded, it is
   told to give its final answer once the goal is met.

After the step budget is exhausted, the loop makes one final, error‑guarded
request asking for a final answer — so the user always gets a reply rather than a
hang.

That reflection nudge is a small but thoughtful touch: it actively discourages
the model from calling tools out of momentum, which is a common failure mode in
agent loops.

---

## 5. The tool system: giving the model hands

Tools are how the assistant goes from *talking about* your tasks to *acting on*
them. They follow a clean **registry pattern**: every tool is a uniform object
with a name, a category (`read` or `write`), a `destructive` flag, a description,
a Zod parameter schema, and an `execute` function. All tools live in a single
array and are indexed by name. Adding a capability is as simple as writing one
file and appending it to the array.

The catalog covers the full task lifecycle:

| Category | Tools |
| --- | --- |
| **Read** | `list_tasks`, `get_task`, `search_tasks`, `list_categories`, `get_calibration`, `find_free_slots`, `recall`, `recall_conversations`, `daily_summary`, `clarify` |
| **Write** | `create_task`, `update_task`, `start_task`, `pause_task`, `complete_task`, `move_to_backlog`, `drop_task` |
| **Meta** | `execute_program` (the sandbox) |

A few design decisions stand out. The Zod schema is used for runtime validation
and execution, while a parallel hand‑written JSON‑Schema map is sent to providers
as native function specs — a deliberate trade‑off, since Zod isn't auto‑converted
to provider schemas. The `clarify` tool is categorized as a read but is really
loop control flow: when present, it ends the turn and renders the question.

Finally, a display layer (`toolDisplay.ts`) turns each raw call into a friendly
card description, and — importantly — strips internal task IDs out of final
replies and bolds known task titles. This enforces the "never show internal IDs"
rule at the render layer, as a belt‑and‑suspenders complement to the
instruction in the system prompt.

---

## 6. Propose‑then‑confirm: safety as a first‑class feature

This is where Yolo's assistant earns trust. The guiding rule from the project's
own design docs is that the assistant **proposes** changes you approve — it does
not silently rewrite your day. The implementation is more nuanced and more
careful than a simple "ask before everything" flag.

### Three permission levels

A small `permissions.ts` module decides whether each call needs confirmation:

- **plan** — the model explores with reads and proposes; *every* change is shown
  for approval.
- **ask** — write tools are allowed, but *every* change is confirmed on a card.
- **auto** — reversible writes apply immediately (with undo), while destructive
  actions still surface a confirmation card.

### Per‑call destructive gating

The elegant part is that "destructive" isn't a fixed property of a tool — it can
depend on the arguments. `update_task` declares itself non‑destructive in
general, but flags itself destructive when the update sets a task's status to
*dropped*. That means dropping a task via an update clears the exact same gate as
the dedicated `drop_task` tool, instead of slipping through in auto mode. This is
a precise, thoughtful safety boundary.

### Undo that actually understands state

Every executed write returns an undo operation — either delete the task it
created, or restore a full snapshot including lifecycle timestamps
(`completed_at`, `dropped_at`, `updated_at`). The system also captures the task's
expected `updated_at` at execution time, so if the task drifts (because something
else edited it in the meantime), the UI can detect that and ask "revert anyway?"
This is real state‑machine reversal, not a naive "set it back" — and it honestly
documents its one limitation: it does not reopen a closed time entry.

### How proposals reach you

When a call needs confirmation, the loop queues a pending record and tells the
model the change is "queued for the user's confirmation (not applied yet)." The
card appears in the conversation, and you apply or dismiss it. The strict
guarantee — *never mutate without approval* — holds for destructive actions;
reversible writes in auto mode are applied immediately but always carry an undo,
which is the pragmatic, user‑friendly interpretation of the rule.

---

## 7. The sandbox: running model‑written code safely

Some requests — "shift every afternoon task 30 minutes later," "rebalance my
day" — are awkward as a dozen separate tool calls. For these, the assistant can
write a small JavaScript program and run it through `execute_program`. The
engineering behind this, in `ptc/sandbox.ts`, is the most sophisticated single
piece of the subsystem.

The program runs inside a **QuickJS WebAssembly virtual machine** — a hard
isolation boundary with no access to the host environment beyond the specific
tools that are injected. The safety rails are layered:

- A **wall‑clock deadline** interrupts a program that runs too long.
- An **abort signal** lets the user stop it.
- A **maximum call count** (60) caps how many tool calls a single program can
  make.
- The VM is always disposed in a `finally` block, so resources never leak.

Crucially, the bridge that exposes tools into the sandbox (`registryBridge.ts`)
applies the **same permission gate** as the normal loop. So a write performed
inside a program still queues as a pending confirmation card and still records an
undo operation — the safety model is preserved even inside model‑written code.
The bridge also excludes `clarify` and `execute_program` themselves, and never
lets an exception leak into the sandbox; it returns structured `{ok, error}`
results instead.

The file carries an extensive docstring explaining *why* it uses a deferred‑
promise pattern with manual job pumping rather than the library's async eval —
the latter would unwind the WebAssembly stack twice and corrupt reference counts.
That kind of documented, deliberate systems decision is a hallmark of senior‑
level work.

---

## 8. Context building: what the model actually sees

A model is only as good as the context it's given. `contextBuilder.ts` assembles
a compact, structured `AssistantContext` from a snapshot of your day: today's
tasks, a capped backlog (30 items), categories, your profile and target minutes,
the ranked memories and skills for this turn, the permission level, and — when
available — retrospective insights.

The builder is **pure and additive**: a block only appears when its data is
non‑empty. A brand‑new user with no history gets a prompt byte‑for‑byte identical
to the pre‑AI baseline. Features layer in only when there's something to say.

The system prompt (`systemPrompt.ts`) is then composed in a fixed order:

1. **The "soul"** — a product grounding preamble plus a scoped time‑management
   persona (yours, or a sensible default). This is a focused productivity
   partner, not a general‑purpose chatbot.
2. **Your profile**, when set.
3. **Learned memories** and **learned skills**, when present.
4. The **markdown output** instruction.
5. The **permission line** for the current mode.
6. The **tool protocol** — a substantial block covering think‑before‑acting, the
   tool‑calling format, the JSON fallback, the "never show IDs" rule, the "the
   card *is* the confirmation, don't double‑confirm" rule, task‑creation
   discipline, when to clarify, when to prefer a program, non‑overlapping
   reschedule guidance, and "check calibration before estimating" — followed by
   the full tool catalog.
7. The **current context** — date, current local time and a "time pulse" (only
   when you're viewing today), categories, today's tasks, and the backlog.
8. The **day briefing** and proactive rules, when present.
9. The **retrospective** block and its rules, when there's history.

Size is bounded structurally — caps on backlog, history (40 messages), injected
memories (8) and skills (5), and tool result counts — rather than by a tokenizer.
It's a simple, predictable strategy that keeps prompts lean by construction.

---

## 9. Memory and skills: two learning loops

Yolo's assistant gets better the more you use it, through two symmetric
background loops that share the same shape: **gate → prompt → parse → fold →
persist.**

**Memory** captures durable facts about *you* — preferences, work style,
context, and plain facts. On the read path (synchronous, every turn), stored
memories are ranked against your message by keyword overlap, with boosts for
pinned and frequently‑used entries, and the top results are rendered into the
prompt. On the write path (background, debounced), a gate decides whether the
turn is worth reviewing — skipping trivial acknowledgements, firing on
preference or correction signals — and an auxiliary model proposes add/update/
archive operations. Those operations are applied by pure, defensive logic:
near‑duplicates become usage bumps rather than new rows, pinned entries are
protected, nothing is ever hard‑deleted (only archived), and unknown IDs are
dropped.

**Skills** mirror this exactly, but capture reusable *procedures* rather than
facts. The skill review fires only after a turn that executed at least two tool
calls, and asks the model to extract at most one *generalized* procedure — no
task‑specific IDs, just a repeatable recipe with a trigger and steps.

Both loops are entirely opt‑in (gated behind a single toggle), entirely
fire‑and‑forget (a failure is swallowed and never blocks your conversation), and
can run on a cheaper auxiliary model that you configure separately. And both are
additive: with nothing learned yet, they contribute nothing to the prompt.

---

## 10. Retrospective analytics: compute the numbers, narrate the story

This layer is the purest expression of Yolo's core engineering principle, and
it's worth stating plainly: **every number is computed deterministically in
TypeScript; the model only ever narrates it.** The model is never asked to do
math on raw rows.

`src/services/retrospect/` contains the proof:

- **`loadHistory.ts`** is the *only* file that touches the database — it loads a
  30‑day window of time entries and tasks. Everything downstream is pure.
- **`calibration.ts`** computes how your estimates compare to reality — a ratio
  of actual to estimated minutes, overall and per category, only reporting
  confidence once there's enough data (five or more qualifying tasks).
- **`slips.ts`** classifies tasks that are slipping — overdue, lingering, or
  dropped — and mines recurring **blocker themes** from your notes by keyword
  frequency.
- **`weeklyReview.ts`** compares this week to last week, surfaces the biggest
  category movers, and counts what you completed and dropped.

These results are exposed to the model only as read tools and as labelled prompt
blocks that repeatedly say "pre‑computed — do not recalculate" and "never invent
numbers that are not shown above." The language model becomes a *narrator over a
deterministic substrate* — which is exactly what makes the insights trustworthy.

A simpler sibling, the **debrief** (`debriefService.ts`), generates an
end‑of‑day Markdown summary in three fixed sections. It hashes its inputs so it
can skip regeneration when nothing has changed, schedules itself with pure
gating logic, and respects your chosen language.

---

## 11. State and UI: streaming, cards, and the dock

The Zustand store in `assistantStore.ts` is the conductor. It holds the messages,
the status, the reasoning steps, and the session caches, and it owns the most
behaviorally delicate logic in the system.

**The streaming placeholder lifecycle** is the trickiest part, and it's handled
with care. A live assistant bubble is created lazily on the first token. When the
model signals it's mid‑reasoning, an optimistic placeholder that was holding tool
JSON is *discarded* — preventing internal step data from leaking into the final
answer. On a user stop, partial content and any executed tool records are
preserved and persisted only when there's something worth keeping.

**Apply‑all batching with conflict‑aware retry** is a genuine highlight. When you
approve a batch of reschedules, some can transiently collide — a task can't move
into a slot another task hasn't vacated yet. Rather than failing, the store makes
**repeated passes**: each landed task frees its slot for the next, and it stops
when a full pass makes no further progress. Real conflicts surface as failures;
already‑handled or cancelled cards are never re‑prompted. It's a clever,
correct fixed‑point solution to a real ordering problem.

On the UI side, the **AssistantDock** is a non‑modal, resizable right rail that
preserves your chat state and width even when hidden (it toggles inert rather
than unmounting). The **MessageList** does smart auto‑scroll — pinning to the
bottom on new messages but only following along during streaming if you're
already near the bottom. The **ReasoningPanel** renders the model's thinking as a
collapsible trace. **ToolCallCards** show pending proposals with Apply/Dismiss
and resolved actions with status and Revert/Retry. And the **BriefingBanner**
shows a deterministic day‑load summary with fixed actions like "Trim my day" and
"Plan my day" — no model involved.

---

## 12. The MCP server: opening Yolo to other agents

Yolo's strategic direction is to be **AI‑native**, and the `mcp/` server is the
clearest seam for that. It's a standalone Node process, built on the Model
Context Protocol SDK and SQLite, that operates on the *same* database the desktop
app uses. It can run read/write by default, or in a strict read‑only mode that
both un‑registers the write tools and opens the database read‑only.

It exposes eleven tools — five reads and six writes spanning the same task
lifecycle the in‑app assistant manages — each carrying MCP annotations
(`readOnlyHint`, `destructiveHint`) so external clients can apply their own
approval policies. Its architecture mirrors the desktop app: repositories for
queries, a session service that enforces the focus‑session business rules (one
session at a time, auto‑pause on switch, short‑continuation and discard
thresholds), and a tool registry built from an array. Writes run in single SQLite
transactions, and WAL mode with a busy timeout lets it coexist with the live app.

The practical effect: an external agent — Claude Desktop, Cursor, or your own —
can manage your tasks indistinguishably from how you would, and new AI
capabilities plug into the same registry.

---

## 13. Cross‑cutting engineering: testing, time, safety, immutability

**Testing.** Coverage is exceptional. Nearly every pure module has a co‑located
test, alongside substantial integration‑style suites for the tool loop, the
streaming path, the system prompt, the sandbox, the registry bridge, and the
memory and skill fold logic. The architecture is *designed* for this: clocks, ID
generators, model‑call functions, and repositories are dependency‑injected
everywhere, and database access is confined to single "impure boundary" files.

**Time‑awareness.** A captured local timestamp, with timezone offset, flows
through the whole turn. A pure time‑pulse derives "in progress / next up /
overdue" entirely in TypeScript, and free‑slot finding clamps its window to
"now." Tellingly, the prompt only reasons about wall‑clock progress when you're
actually viewing today — so it never says "you're behind" about a past or future
date.

**Internationalization.** Twenty languages are supported; the debrief honors your
chosen language, and the assistant mirrors yours. A Unicode‑aware key
normalizer (NFKC) specifically fixes an earlier bug where CJK text collapsed to
an empty deduplication key.

**Immutability and safety.** Updates are spread‑based throughout — store arrays
are never mutated in place. The sandbox is hard‑isolated; permission gating,
destructive confirmation, and undo form defense in depth; internal IDs never
reach a final reply; keys are bring‑your‑own and never logged; and there is no
evaluation of model output anywhere outside the sandbox.

---

## 14. Design principles that hold the whole thing together

A handful of principles recur across every layer, and together they define the
character of the system:

1. **Compute deterministically, narrate with the model.** All math lives in
   TypeScript; the model only ever puts words around numbers it's handed.
2. **The registry pattern.** Both the in‑app tools and the MCP tools share one
   uniform shape and a single append‑point — capabilities are cheap to add and
   impossible to half‑register.
3. **Propose‑then‑confirm with per‑call destructive gating.** Safety is encoded
   in data (a `destructiveFor` predicate), backed by full undo snapshots, and
   preserved even inside the sandbox.
4. **A provider‑neutral agent loop.** The loop consumes a normalized list of
   tool calls regardless of provider, with a JSON fallback for models that lack
   native tool calling.
5. **Two symmetric, additive learning loops.** Memory and skills share the same
   gate‑prompt‑parse‑fold‑persist shape, contribute nothing when empty, and never
   block the conversation.
6. **Dependency injection for testability.** Clocks, IDs, model calls, and data
   access are all injectable — which is exactly why the test suite can be so
   thorough.

---

## 15. Honest trade‑offs and where the complexity lives

A review that only praises isn't useful. These are the places where the design
makes a deliberate trade or carries real cognitive load:

1. **Two parameter schemas per tool.** Each tool's parameters exist both as a Zod
   schema and as a hand‑maintained JSON‑Schema entry for native tool calling.
   They can drift silently; generating one from the other would close that gap.
2. **Business rules live in two codebases.** The MCP session service mirrors the
   desktop store's focus‑session rules. Any change to session semantics must be
   made in both — there's no shared package enforcing parity.
3. **Keyword‑only retrieval.** Memory, skill, recall, and search ranking are all
   substring‑overlap scorers — cheap and deterministic, consistent with the
   philosophy, but they'll degrade for paraphrased or cross‑lingual queries as
   the stores grow.
4. **No token budgeting.** Prompt size is bounded by hard caps rather than actual
   token counting, with no summarization fallback if a provider rejects on
   context length.
5. **An invariant with nuance.** "The assistant never mutates tasks directly" is
   literally true only for destructive actions; in auto mode, reversible writes
   execute in‑loop (always with undo). The behavior is right; the doc wording
   slightly overstates the guarantee.
6. **The sandbox is subtle.** It's correct and well‑tested, but the deferred‑
   promise and manual job‑pumping model is the highest‑cognitive‑load code in the
   system and the most sensitive to QuickJS upgrades.
7. **Auxiliary reviews default to the main model.** Background memory and skill
   reviews fall back to the foreground model when no cheaper auxiliary model is
   configured — which can incur full‑price calls on substantive turns.

None of these undercut the system; they're the natural edges of an ambitious,
well‑built design. Taken as a whole, Yolo's AI subsystem is mature, senior‑grade
engineering: cleanly layered, deterministic where it matters, safe by
construction, and tested to a degree most production codebases never reach.

---

*This review reflects the architecture as implemented across `src/services/ai/`,
`src/services/retrospect/`, `src/stores/assistantStore.ts`,
`src/components/assistant/`, and `mcp/`.*
