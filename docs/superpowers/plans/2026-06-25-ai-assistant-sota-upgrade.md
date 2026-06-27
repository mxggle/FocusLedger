# AI Assistant SOTA Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-app assistant stream every step to the UI (tool reasoning folded, final answer live), support true mid-flight abort, and use native tool-calling for Anthropic/OpenAI/Custom with a text-based fallback — unlocking parallel tool execution and structured outputs.

**Architecture:** Introduce a streaming `streamChatV2` that returns `{ text, toolCalls }` and emits `onToken`/`onToolCall` callbacks + honors an abort signal. Rewrite `runToolLoop` to consume it per step, streaming tool-step prose into the live `ReasoningPanel` and the final answer into the assistant bubble. Add native `tools` + `tool_choice` to Anthropic/OpenAI/Custom request bodies and parse streamed `tool_use`/`tool_calls` deltas back into the canonical `{tool_calls:[…]}` form, keeping `parseToolCalls` as the fallback for text-only replies. Thread `AbortSignal` end-to-end so Stop cancels the in-flight fetch.

**Tech Stack:** TypeScript, Vitest, Zustand, @tauri-apps/plugin-http, React.

## Global Constraints

- No behavior change for the Gemini path (already native + streaming-ready) beyond sharing the new return shape.
- Text-based `{tool_calls:…}` JSON protocol must still work as a fallback for any OpenAI-compatible endpoint that ignores `tools` or returns whole-JSON replies.
- All numbers stay deterministic in TS (no change to retrospect/briefing).
- `yarn build` (tsc + vite) and `yarn test` (vitest) must pass after each commit. Rust untouched, so no `cargo check` needed here.
- No new runtime dependencies.
- Use the existing `ParsedToolCall` type from `src/services/ai/assistant/responseParser.ts` everywhere tool calls are represented in TS.
- Stage ONLY files you changed for a task — never `git add -A`. There are unrelated uncommitted `vite.config.*` changes in the working tree that must NOT be included in your commits.

## File map

- **Modify** `src/services/ai/chatClient.ts` — add `streamChatV2`, keep `streamChat`/`generateChat` for debrief use.
- **Modify** `src/services/ai/providers.ts` — native `tools` for OpenAI/Anthropic/Custom in `buildChatRequest`; add streamed-tool-call parsers.
- **Modify** `src/services/ai/assistant/responseParser.ts` — keep text fallback; reuse `ParsedToolCall` type.
- **Modify** `src/services/ai/assistant/toolLoop.ts` — streaming per step, abort, parallel exec, streaming callback shape.
- **Modify** `src/services/ai/assistant/assistantRunner.ts` — pass signal + `onToken`.
- **Modify** `src/services/ai/assistant/systemPrompt.ts` — relax TOOL_PROTOCOL so native-tool models don't force JSON-only final answers.
- **Modify** `src/stores/assistantStore.ts` — thread signal, set `streaming` status + `streamingMessageId`, live-update assistant message content.
- **Modify** `src/components/assistant/MessageList.tsx` + `MessageRow.tsx` — render streaming content live; fold tool-step reasoning.
- **New test** `src/services/ai/assistant/streamToolLoop.test.ts`.

---

### Task 1: Thread the abort signal through to the fetch (no streaming yet)

**Files:**
- Modify: `src/services/ai/chatClient.ts`
- Modify: `src/services/ai/assistant/toolLoop.ts`
- Modify: `src/services/ai/assistant/assistantRunner.ts`
- Modify: `src/stores/assistantStore.ts`
- Test: `src/services/ai/assistant/toolLoop.test.ts`

**Interfaces:**
- `ToolLoopInput` gains `signal?: AbortSignal`
- `RunAssistantTurnInput` gains `signal?: AbortSignal`
- `generateChat` in `chatClient.ts` gains optional `signal?: AbortSignal` threaded into `fetch(..., { signal })`
- Consumes: `ParsedToolCall` from `responseParser.ts` (no change), `nativeToolSpecs`/`toolByName` from registry
- Produces: abort-aware `runToolLoop` that respects `input.signal?.aborted` between steps and at fetch

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/toolLoop.test.ts`:

```ts
it("aborts before starting when the signal is already aborted", async () => {
  const generateChat = vi.fn(async () => "Done.");
  const controller = new AbortController();
  controller.abort();
  const res = await runToolLoop(
    {
      system: "sys",
      messages: [{ role: "user", content: "x" }],
      level: "auto",
      deps: depsWith(),
      signal: controller.signal
    },
    { generateChat }
  );
  expect(generateChat).not.toHaveBeenCalled();
  expect(res.reply.trim()).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test toolLoop.test`
Expected: FAIL — `generateChat` is called (signal ignored).

- [ ] **Step 3: Write minimal implementation**

In `src/services/ai/chatClient.ts`, change the `generateChat` signature to accept an optional `signal` and pass it to `fetch`:

```ts
export async function generateChat(
  settings: AiSettings,
  input: ChatInput,
  signal?: AbortSignal
): Promise<string> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const request = buildChatRequest(settings, input);

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the AI provider: ${detail}`);
  }
  // ... rest unchanged
}
```

In `src/services/ai/assistant/toolLoop.ts`, add `signal?: AbortSignal` to `ToolLoopInput`. At the top of the `for` loop body, check abort; if aborted, throw an abort-named error so callers can detect it:

```ts
export async function runToolLoop(
  input: Omit<ToolLoopInput, "settings"> & { settings?: AiSettings },
  deps: ToolLoopDeps = { generateChat: defaultGenerateChat }
): Promise<ToolLoopResult> {
  const settings = input.settings ?? ({} as AiSettings);
  const messages: ChatTurn[] = [...input.messages];
  const records: ToolCallRecord[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (input.signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const raw = await deps.generateChat(settings, {
      system: input.system,
      messages,
      temperature: TOOL_TEMPERATURE,
      tools: nativeToolSpecs()
    }, input.signal);
    // ... rest unchanged
  }
  // ... forced-final block unchanged, but pass input.signal to its generateChat call too
}
```

Wire `signal` through the forced-final-answer `deps.generateChat(...)` call at the end of `runToolLoop` as well.

- [ ] **Step 4: Wire signal through runner and store**

In `src/services/ai/assistant/assistantRunner.ts`, add `signal?: AbortSignal` to `RunAssistantTurnInput` and pass it into `runToolLoop({ ..., signal: input.signal })`.

In `src/stores/assistantStore.ts` `runStreamFrom`, pass `signal` into `runAssistantToolTurn({ ..., signal })`. The store already creates `currentAbort = new AbortController()` and `const signal = controller.signal;` — thread that `signal` into the `runAssistantToolTurn` call.

- [ ] **Step 5: Verify**

Run: `yarn test toolLoop.test && yarn build`
Expected: PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/chatClient.ts src/services/ai/assistant/toolLoop.ts src/services/ai/assistant/toolLoop.test.ts src/services/ai/assistant/assistantRunner.ts src/stores/assistantStore.ts
git commit -m "feat(assistant): thread abort signal to in-flight provider requests"
```

---

### Task 2: Add native tool-calling to Anthropic + OpenAI/Custom request bodies (non-streaming first)

**Files:**
- Modify: `src/services/ai/providers.ts`
- Modify: `src/services/ai/assistant/responseParser.ts`
- Test: `src/services/ai/providers.test.ts` (create if absent)

**Interfaces:**
- `buildChatRequest` already receives `input.tools`; extend the Anthropic, OpenAI, and Custom branches to serialize them.
- Refactor `parseAiResponse` to return `{ text: string; toolCalls: ParsedToolCall[] }` instead of `string`. Update all callers (`chatClient.ts` `generateChat`, eval harness, debrief caller if any uses `parseAiResponse` directly).
- Consumes: `ParsedToolCall` type from `responseParser.ts`
- Produces: `parseNativeToolCalls`-style logic folded into `parseAiResponse`, native `tools` arrays in request bodies

- [ ] **Step 1: Write failing test**

Create `src/services/ai/providers.test.ts` (or add to existing) asserting that OpenAI and Anthropic chat requests include native tool specs:

```ts
import { describe, expect, it } from "vitest";
import { buildChatRequest } from "./providers";

const settings = { aiProvider: "openai", aiApiKey: "k", aiModel: "", aiBaseUrl: "" } as never;
const tools = [{ name: "list_tasks", description: "list", parameters: { type: "object", properties: {} } }];

describe("buildChatRequest native tools", () => {
  it("serializes tools for openai as functions with tool_choice auto", () => {
    const req = buildChatRequest(settings, { system: "s", messages: [], tools });
    const body = req.body as Record<string, unknown>;
    const toolsArr = body.tools as Array<{ type: string; function: { name: string } }>;
    expect(toolsArr).toHaveLength(1);
    expect(toolsArr[0].type).toBe("function");
    expect(toolsArr[0].function.name).toBe("list_tasks");
    expect(body.tool_choice).toBe("auto");
  });

  it("omits tools when none supplied", () => {
    const req = buildChatRequest(settings, { system: "s", messages: [] });
    expect((req.body as Record<string, unknown>).tools).toBeUndefined();
    expect((req.body as Record<string, unknown>).tool_choice).toBeUndefined();
  });

  it("serializes tools for anthropic with input_schema", () => {
    const anthropicSettings = { ...settings, aiProvider: "anthropic" } as never;
    const req = buildChatRequest(anthropicSettings, { system: "s", messages: [], tools });
    const body = req.body as Record<string, unknown>;
    const toolsArr = body.tools as Array<{ name: string; input_schema: unknown }>;
    expect(toolsArr).toHaveLength(1);
    expect(toolsArr[0].name).toBe("list_tasks");
    expect(toolsArr[0].input_schema).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test providers.test`
Expected: FAIL — `tools` undefined for OpenAI/Anthropic.

- [ ] **Step 3: Implement request-body serialization**

In `src/services/ai/providers.ts`, extend `buildOpenAiCompatibleChatRequest`:

```ts
function buildOpenAiCompatibleChatRequest(
  baseUrl: string,
  settings: AiSettings,
  input: ChatInput
): AiRequest {
  return {
    url: `${normalizeBaseUrl(baseUrl)}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: {
      model: resolveModel(settings),
      messages: [
        { role: "system", content: input.system },
        ...input.messages
      ],
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.stream ? { stream: true } : {}),
      ...(input.tools && input.tools.length > 0
        ? {
            tools: input.tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters ?? { type: "object", properties: {} }
              }
            })),
            tool_choice: "auto"
          }
        : {})
    }
  };
}
```

Extend the `anthropic` branch of `buildChatRequest`:

```ts
case "anthropic":
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.aiApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: {
      model: resolveModel(settings),
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: input.system,
      messages: input.messages,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.stream ? { stream: true } : {}),
      ...(input.tools && input.tools.length > 0
        ? {
            tools: input.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters ?? { type: "object", properties: {} }
            }))
          }
        : {})
    }
  };
```

- [ ] **Step 4: Refactor `parseAiResponse` to also surface native tool calls**

Change the return type of `parseAiResponse` to `{ text: string; toolCalls: ParsedToolCall[] }`. Import `ParsedToolCall` from `./assistant/responseParser` (or move the `ParsedToolCall` type into `providers.ts` if you prefer to avoid a circular path — choose one location and re-export). Document your choice in a one-line comment is NOT allowed (no comments); just keep it consistent.

Update each branch:

```ts
export function parseAiResponse(provider: AiProvider, payload: unknown): { text: string; toolCalls: ParsedToolCall[] } {
  let text = "";
  const toolCalls: ParsedToolCall[] = [];

  switch (provider) {
    case "anthropic": {
      const response = payload as AnthropicResponse;
      const blocks = response.content ?? [];
      text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      for (const b of blocks) {
        if (b.type === "tool_use" && typeof b.name === "string") {
          toolCalls.push({ name: b.name, args: b.input ?? {} });
        }
      }
      break;
    }
    case "openai":
    case "custom": {
      const response = payload as OpenAiResponse;
      const msg = response.choices?.[0]?.message;
      text = msg?.content ?? "";
      const calls = msg?.tool_calls;
      if (Array.isArray(calls)) {
        for (const c of calls) {
          if (typeof c?.function?.name === "string") {
            let args: unknown = {};
            try {
              args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
              args = {};
            }
            toolCalls.push({ name: c.function.name, args: args as Record<string, unknown> });
          }
        }
      }
      break;
    }
    case "gemini": {
      const response = payload as GeminiResponse;
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const calls = parts
        .map((p) => p.functionCall)
        .filter((c): c is { name: string; args?: Record<string, unknown> } => typeof c?.name === "string")
        .map((c) => ({ name: c.name, args: c.args ?? {} }));
      if (calls.length > 0) {
        toolCalls.push(...calls);
      } else {
        text = parts.map((p) => p.text ?? "").join("");
      }
      break;
    }
  }

  const trimmed = text.trim();
  if (trimmed.length === 0 && toolCalls.length === 0) {
    throw new Error("The AI provider returned an empty response");
  }
  return { text: trimmed, toolCalls };
}
```

Update the `AnthropicResponse` and `OpenAiResponse` types to include tool-use/tool-call fields. Keep `GeminiResponse` as-is.

- [ ] **Step 5: Update all callers of `parseAiResponse`**

Grep for `parseAiResponse(`. Update each:
- `src/services/ai/chatClient.ts` `generateChat`: change `return parseAiResponse(...)` to `const { text } = parseAiResponse(...); return text;` (debrief path only needs text).
- Any eval harness / other callers that destructured a string: take `.text`. The eval harness `runEval` uses a scripted `generateChat`, so it is unaffected — but double-check.

- [ ] **Step 6: Verify**

Run: `yarn test providers.test chatClient && yarn build`
Expected: PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/providers.ts src/services/ai/providers.test.ts src/services/ai/chatClient.ts
git commit -m "feat(ai): send native tools and parse structured tool calls for anthropic/openai"
```

---

### Task 3: Route loop to native tool calls when present; keep text fallback; execute reads in parallel

**Files:**
- Modify: `src/services/ai/assistant/toolLoop.ts`
- Modify: `src/services/ai/assistant/systemPrompt.ts`
- Test: `src/services/ai/assistant/toolLoop.test.ts`

**Interfaces:**
- `ToolLoopDeps.generateChat` return shape becomes `{ text: string; toolCalls: ParsedToolCall[] }` (or a new `generateChatV2` dep is added — see decision below)
- Consumes: `ParsedToolCall`, `parseToolCalls` (text fallback)
- Produces: native-tool-aware loop; reads executed in parallel via `Promise.all`

**Decision (already made, stated here for the implementer):** `ToolLoopDeps.generateChat` keeps returning a `Promise<string>` (the raw reply text), for now to minimize blast radius. Native tool calls arrive ONLY via the streaming `streamChatV2` path added in Task 4/5. To keep Task 3 independently testable without Task 4, allow the loop to ALSO accept structured tool calls from the generator when present: add an optional `generateChatV2?: (settings, input, signal?) => Promise<{ text: string; toolCalls: ParsedToolCall[] }>` to `ToolLoopDeps`. When `generateChatV2` is provided, use it; else use `generateChat` + `parseToolCalls` text fallback. Both coexist until Task 5 swaps the store to `generateChatV2`.

- [ ] **Step 1: Write failing tests**

Add to `src/services/ai/assistant/toolLoop.test.ts`:

```ts
it("uses native toolCalls from generateChatV2 when provided", async () => {
  const list = vi.fn(async () => ({ ok: true, summary: "1 task" }));
  const generateChatV2 = async () => ({
    text: "",
    toolCalls: [{ name: "list_tasks", args: { scope: "today" } }]
  });
  let call = 0;
  const v2 = async () => call++ === 0
    ? { text: "", toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] }
    : { text: "Done.", toolCalls: [] };
  const res = await runToolLoop(
    {
      system: "sys",
      messages: [{ role: "user", content: "x" }],
      level: "auto",
      deps: depsWith()
    },
    { generateChatV2: v2 }
  );
  expect(res.reply).toContain("Done");
});

it("executes parallel read tools concurrently", async () => {
  let started = 0;
  let inFlight = 0;
  const list = vi.fn(async () => {
    inFlight += 1;
    started += 1;
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    return { ok: true, summary: "ok" };
  });
  const v2 = async () => ({
    text: "",
    toolCalls: [
      { name: "list_tasks", args: { scope: "today" } },
      { name: "list_tasks", args: { scope: "backlog" } }
    ]
  });
  const res = await runToolLoop(
    {
      system: "sys",
      messages: [{ role: "user", content: "both scopes" }],
      level: "auto",
      deps: depsWith()
    },
    { generateChatV2: async () => {
      if (started === 0) return v2();
      return { text: "got both.", toolCalls: [] };
    } }
  );
  expect(list).toHaveBeenCalledTimes(2);
  expect(res.reply).toContain("got both");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test toolLoop.test`
Expected: FAIL — `generateChatV2` not recognized; reads run sequentially.

- [ ] **Step 3: Implement**

In `src/services/ai/assistant/toolLoop.ts`:

Add to `ToolLoopDeps`:
```ts
export type ToolLoopDeps = {
  generateChat?: (settings: AiSettings, input: ChatInput, signal?: AbortSignal) => Promise<string>;
  generateChatV2?: (settings: AiSettings, input: ChatInput, signal?: AbortSignal) => Promise<{ text: string; toolCalls: ParsedToolCall[] }>;
};
```

In the loop, each step:
```ts
let raw: string;
let nativeCalls: ParsedToolCall[] | null = null;
if (deps.generateChatV2) {
  const { text, toolCalls } = await deps.generateChatV2(settings, { system: input.system, messages, temperature: TOOL_TEMPERATURE, tools: nativeToolSpecs() }, input.signal);
  raw = text;
  nativeCalls = toolCalls.length > 0 ? toolCalls : null;
} else {
  raw = await (deps.generateChat ?? defaultGenerateChat)(settings, { system: input.system, messages, temperature: TOOL_TEMPERATURE, tools: nativeToolSpecs() }, input.signal);
  nativeCalls = null;
}

const calls = nativeCalls ?? parseToolCalls(raw);
if (!calls) return { reply: raw.trim(), toolCalls: records };
```

Split call processing: collect read calls and write calls from `calls`. Execute read calls with `Promise.all` (preserving order in feedback). Execute write calls sequentially AFTER reads complete (to keep undo/revert ordering predictable). Build feedback in call order.

```ts
const feedback: string[] = new Array(calls.length).fill("");
const readIndices: number[] = [];
calls.forEach((call, idx) => {
  const tool = toolByName(call.name);
  if (!tool || tool.category === "read") {
    if (tool) readIndices.push(idx);
  }
});
await Promise.all(readIndices.map(async (idx) => {
  const call = calls[idx];
  const tool = toolByName(call.name)!;
  const parsed = tool.parameters.safeParse(call.args);
  if (!parsed.success) {
    feedback[idx] = `${call.name}: invalid args - ${parsed.error.issues[0]?.message ?? "bad args"}`;
    return;
  }
  const result = await tool.execute(call.args, input.deps);
  feedback[idx] = `${call.name}: ${result.ok ? result.summary : result.error}`;
  input.onStep?.(`Looking up ${call.name}...`);
}));

// writes sequential
for (let idx = 0; idx < calls.length; idx++) {
  const call = calls[idx];
  const tool = toolByName(call.name);
  if (!tool || tool.category === "read") continue;
  // ... existing write handling, writing into feedback[idx] and records
}
```

Always append the assistant message turn (use `raw` if non-empty, else a synthesized JSON for native calls when `raw` is empty so the transcript stays coherent). Append the `"Tool results:"` user message as before.

- [ ] **Step 4: Relax the system prompt TOOL_PROTOCOL**

In `src/services/ai/assistant/systemPrompt.ts`, find the `TOOL_PROTOCOL` block. Change the instruction from "respond with ONLY a JSON object" to something like:

```
Tool-calling protocol:
- When you need to call a tool, use the tool-calling API your provider exposes (function calling). When a tool is not available via the API or your provider has no native tool calling, you may instead respond with ONLY a JSON object: { "tool_calls": [ { "name": "list_tasks", "args": { "scope": "today" } } ] }.
- You will receive tool results as the next message. Continue with more tool calls if needed, or give your final answer.
- Final answers are plain Markdown. Do not append legacy actions JSON or wrap the reply in JSON.
- Never show internal task ids, category ids, or tool names in final replies. Use task titles and human-readable times only.
- (keep remaining bullets: current time, reads vs writes, create_task constraints, list before bulk change, get_calibration, recall)
```

Keep the rest of `TOOL_PROTOCOL` intact.

- [ ] **Step 5: Verify**

Run: `yarn test assistant && yarn build`
Expected: PASS, build clean. Existing `toolLoop.test.ts` tests (text-based `generateChat`) must still pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/toolLoop.ts src/services/ai/assistant/toolLoop.test.ts src/services/ai/assistant/systemPrompt.ts
git commit -m "feat(assistant): native tool calls with parallel read execution and text fallback"
```

---

### Task 4: `streamChatV2` — stream text deltas + accumulate native tool calls, with abort

**Files:**
- Modify: `src/services/ai/chatClient.ts`
- Modify: `src/services/ai/providers.ts`
- Test: `src/services/ai/chatClient.test.ts` (create or extend)

**Interfaces:**
```ts
export type StreamCallbacksV2 = {
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
};
export async function streamChatV2(
  settings: AiSettings,
  input: ChatInput,
  cb: StreamCallbacksV2
): Promise<{ text: string; toolCalls: ParsedToolCall[] }>;
```
- Consumes: `ParsedToolCall`, `buildChatRequest` (with `stream:true`)
- Produces: `streamChatV2`, per-provider streamed tool-call accumulators

- [ ] **Step 1: Write the failing test**

Create `src/services/ai/chatClient.test.ts` with a synthetic OpenAI-style SSE stream and an Anthropic-style SSE stream. Use a stubbed global `fetch`. Assert `onToken` saw prose tokens and the returned `toolCalls` has the parsed call(s). Test abort mid-stream returns accumulated text without throwing.

Example skeleton for OpenAI (use a `ReadableStream` built from string chunks):

```ts
import { describe, expect, it, vi } from "vitest";
import { streamChatV2 } from "./chatClient";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("streamChatV2", () => {
  it("streams OpenAI tokens and accumulates tool_calls", async () => {
    const tokens: string[] = [];
    const fetchMock = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"list_tasks","arguments":"{\\"scope\\":\\"today\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n'
    ]));
    (globalThis as { fetch: unknown }).fetch = fetchMock as unknown;
    const { text, toolCalls } = await streamChatV2(
      { aiProvider: "openai", aiApiKey: "k", aiModel: "", aiBaseUrl: "" } as never,
      { system: "s", messages: [] },
      { onToken: (c) => tokens.push(c) }
    );
    expect(tokens.join("")).toBe("Hello");
    expect(text).toBe("Hello");
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" } }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test chatClient.test`
Expected: FAIL — `streamChatV2` undefined.

- [ ] **Step 3: Implement `streamChatV2`**

In `src/services/ai/chatClient.ts` add the function mirroring the existing `streamChat` SSE loop, but with per-provider delta handling:

- OpenAI/Custom: accumulate `delta.content` into `onToken`; accumulate `delta.tool_calls[].function.{name,arguments}` per `index` into a `Map<number, {name, argsString}>`. On stream end (or `finish_reason`), build `toolCalls` by parsing each accumulated args JSON.
- Anthropic: parse the event-stream line by line. Anthropic SSE uses event lines (`event: content_block_start`, `content_block_delta`, `content_block_stop`). Track content blocks by `index`: `text` blocks feed `text_delta.text` to `onToken`; `tool_use` blocks accumulate `input_json_delta.partial_json`. On `content_block_stop`, finalize the tool call by parsing accumulated args.
- Gemini reuse existing `extractDelta` for text; native `functionCall` parts (non-streamed per `gemini-2.5-flash`) — if the streamed payload includes a candidate part with `functionCall`, parse it.

Return `{ text: accumulated, toolCalls }`. On abort, resolve (do not throw) with whatever accumulated.

Keep the existing `streamChat` v1 untouched for now (Task 7 audits it). Do not modify `streamChat`.

- [ ] **Step 4: Export `ParsedToolCall` reuse**

Ensure `ParsedToolCall` is importable from `src/services/ai/assistant/responseParser.ts` (it already is) and import it into `chatClient.ts`. If circular import concerns arise, move `ParsedToolCall` to `providers.ts` and re-export from `responseParser.ts`. Pick one canonical home and keep both files importing from it.

- [ ] **Step 5: Verify**

Run: `yarn test chatClient.test providers.test && yarn build`
Expected: PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/chatClient.ts src/services/ai/chatClient.test.ts src/services/ai/providers.ts
git commit -m "feat(ai): streamChatV2 streams text and accumulates native tool calls with abort"
```

---

### Task 5: Wire `runToolLoop` to `streamChatV2`; stream every step to the UI (tool detail folded)

**Files:**
- Modify: `src/services/ai/assistant/toolLoop.ts`
- Modify: `src/services/ai/assistant/assistantRunner.ts`
- Modify: `src/stores/assistantStore.ts`
- Modify: `src/components/assistant/MessageList.tsx`
- Modify: `src/components/assistant/MessageRow.tsx`
- Test: `src/services/ai/assistant/streamToolLoop.test.ts` (new)

**Interfaces:**
- `ToolLoopInput` gains `onToken?: (chunk: string) => void` and `onStreamStep?: (stepIndex: number, kind: "reasoning" | "final") => void`
- `RunAssistantTurnInput` gains `onToken?: (chunk: string) => void`
- `assistantStore` creates a streaming assistant `ChatMessage` placeholder, sets `streamingMessageId` + `status:"streaming"`, appends token chunks live, finalizes on completion
- Consumes: `streamChatV2`, `ToolLoopDeps.generateChatV2`
- Produces: streaming-aware loop; live-streaming assistant bubble

- [ ] **Step 1: Write failing test**

Create `src/services/ai/assistant/streamToolLoop.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runToolLoop } from "./toolLoop";
// reuse depsWith shape from toolLoop.test.ts (export it or inline a minimal one)

describe("runToolLoop streaming", () => {
  it("streams final-answer tokens through onToken", async () => {
    const tokens: string[] = [];
    let emitted = false;
    const generateChatV2 = async () => {
      if (!emitted) {
        emitted = true;
        return { text: "", toolCalls: [] };
      }
      return { text: "", toolCalls: [] };
    };
    // Use a scripted v2 that emits tokens for the final step:
    let step = 0;
    const v2 = async (_s: unknown, _i: unknown, _cb: { onToken?: (c: string) => void }) => {
      step += 1;
      if (step === 1) {
        _cb.onToken?.("Hello");
        _cb.onToken?.(" world");
        return { text: "Hello world", toolCalls: [] };
      }
      return { text: "Hello world", toolCalls: [] };
    };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        level: "auto",
        deps: { /* minimal */ } as never,
        onToken: (c) => tokens.push(c),
        onStreamStep: (_i, kind) => {}
      },
      { generateChatV2: v2 as never }
    );
    expect(res.reply).toBe("Hello world");
    expect(tokens.join("")).toBe("Hello world");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test streamToolLoop.test`
Expected: FAIL — `onToken` not honored.

- [ ] **Step 3: Implement loop streaming**

In `src/services/ai/assistant/toolLoop.ts`, add `onToken?: (chunk: string) => void` and `onStreamStep?: (stepIndex: number, kind: "reasoning" | "final") => void` to `ToolLoopInput`. When `deps.generateChatV2` is used, pass an `onToken` callback into `streamChatV2` that both feeds the loop's local accumulator and forwards to `input.onToken`. After the step resolves:
- If `toolCalls.length > 0`: call `input.onStreamStep?.(step, "reasoning")`.
- If `toolCalls.length === 0` (final answer): call `input.onStreamStep?.(step, "final")`.

For the forced-final-answer fallback at the end (12-step cap), also pass `onToken` so that streamed text reaches the UI.

- [ ] **Step 4: Wire runner + store**

In `src/services/ai/assistant/assistantRunner.ts`, add `onToken?: (chunk: string) => void` to `RunAssistantTurnInput` and pass through to `runToolLoop({ ..., onToken: input.onToken })`.

In `src/stores/assistantStore.ts` `runStreamFrom`:
- Create the assistant `ChatMessage` placeholder immediately (empty `content`, an `id`, `createdAt`), set `streamingMessageId: msg.id` and `status: "streaming"`, and add it to `messages`. (Do NOT persist yet.)
- Accumulate streamed text in a local `streamBuffer` variable. In `onToken`, append the chunk to `streamBuffer` and update the placeholder message's `content` in state (batch updates via a simple `set` with the new content — React will re-render; if perf matters, throttle with rAF, but a direct set per chunk is acceptable for now).
- Pass `signal` (already threaded in Task 1) into `runAssistantToolTurn`.
- On completion: finalize the message `content` to `result.reply` (or the stream buffer if reply was empty from a non-streaming forced final), clear `streaming`, persist the message.
- If `result.toolCalls` contain executed writes, `await adapter.refresh()` before finalizing.

- [ ] **Step 5: UI rendering**

In `src/components/assistant/MessageList.tsx`, the streaming message already keys `isStreaming` off `streamingMessageId`. Confirm the placeholder assistant message renders while `status === "streaming"` and its `content` updates live. Ensure scroll-to-bottom pins during streaming (the existing effect keys on `messages`/`status`/`streamingMessageId`, which now changes per token — verify it does not thrash; if it does, gate the pin effect on `status` transitions only).

In `src/components/assistant/MessageRow.tsx`, the `AssistantRow` already renders `<Markdown content={displayContent}/>` and the streaming caret when `isStreaming`. With live-updating `content`, the caret should render while `status === "streaming"`. No structural change needed beyond confirming the caret shows during streaming and hides when finalized.

For the folded tool reasoning: the `ReasoningPanel` already consumes `steps`. The streamed tool-step prose that lands in `steps` (from `onStep`/`onStreamStep` reasoning) renders folded in the existing collapsible panel. No new component needed — confirm the labels update as steps stream.

- [ ] **Step 6: Verify**

Run: `yarn test assistant assistantStore MessageRow MessageList && yarn build`
Expected: PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/assistant/toolLoop.ts src/services/ai/assistant/assistantRunner.ts src/services/ai/assistant/streamToolLoop.test.ts src/stores/assistantStore.ts src/components/assistant/MessageList.tsx src/components/assistant/MessageRow.tsx
git commit -m "feat(assistant): stream every step to the UI with folded tool reasoning"
```

---

### Task 6: Stop button cancels the network + finalizes partial state

**Files:**
- Modify: `src/stores/assistantStore.ts`
- Modify: `src/services/ai/assistant/toolLoop.ts`
- Test: `src/stores/assistantStore.test.ts` (extend) or `src/services/ai/assistant/streamToolLoop.test.ts`

**Interfaces:** no new exports; behavior: aborted turns mark the streaming message `stopped: true`, finalize accumulated content, and return to `status:"idle"`.

- [ ] **Step 1: Write failing test**

Assert that when the abort signal fires mid-stream, the placeholder assistant message gets `stopped: true`, the assistant store returns to `status: "idle"`, and no unhandled rejection occurs. Use a scripted slow `streamChatV2` that resolves on abort with partial text.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test streamToolLoop assistantStore`
Expected: FAIL — partial message not finalized as `stopped`.

- [ ] **Step 3: Implement**

In `src/stores/assistantStore.ts` `runStreamFrom`:
- Wrap the `runAssistantToolTurn` call in try/catch that already exists. When `signal.aborted || currentAbort !== controller`:
  - Finalize the placeholder message: set `content` to the accumulated `streamBuffer` (or `result.reply` if the loop returned), set `stopped: true`, clear `streaming`, set `status: "idle"`, persist.
  - If `result.toolCalls` contain executed records (the loop may return them even on abort between steps), keep them on the message so already-produced confirm cards survive.
- The loop (`runToolLoop`) already throws an `AbortError`-named error on between-step abort (Task 1); ensure the catch path finalizes rather than just clearing.

- [ ] **Step 4: Verify**

Run: `yarn test assistantStore streamToolLoop && yarn build`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/services/ai/assistant/toolLoop.ts
git commit -m "feat(assistant): stop cancels in-flight stream and finalizes partial message"
```

---

### Task 7: Remove vestigial non-streaming path + dead code

**Files:**
- Modify: `src/services/ai/chatClient.ts`
- Modify: `src/services/ai/assistant/toolLoop.ts`

- [ ] **Step 1: Audit callers**

Grep for `streamChat(` (v1) and `generateChat(`. Keep `generateChat` for the `debriefService` one-shot path (it legitimately stays non-streaming). Confirm `streamChat` v1 has no remaining callers besides its own test. If unused outside tests, delete `streamChat` and its test. If `chatClient.test.ts` (Task 4) tests `streamChatV2` only, the v1 test file can be removed.

- [ ] **Step 2: Drop `ToolLoopDeps.generateChat` text-only path if fully superseded**

If the store now always passes `generateChatV2`, the `deps.generateChat` text fallback in `runToolLoop` becomes dead for the assistant path but is still useful for the eval harness (which uses scripted text replies). Decide:
- Keep `generateChat` as a documented fallback for tests/evals (recommended — eval harness uses text replies).
- OR convert the eval harness to script `generateChatV2`.

Choose **keep `generateChat` as fallback** (eval harness simplicity). No code change beyond a confirm.

- [ ] **Step 3: Verify**

Run: `yarn test && yarn build`
Expected: full suite PASS, build clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/chatClient.ts src/services/ai/assistant/toolLoop.ts
git commit -m "chore(assistant): drop unused streamChat v1, finalize streaming loop"
```