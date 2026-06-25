import { fetch } from "@tauri-apps/plugin-http";
import { hasAiKey } from "./aiClient";
import {
  buildChatRequest,
  extractErrorMessage,
  parseAiResponse,
  type AiSettings,
  type ChatInput,
  type ParsedToolCall
} from "./providers";
import type { AiProvider } from "../../types";

/**
 * Multi-turn text generation against the configured provider. Like
 * `generateText`, but takes a full message history. One network round-trip per
 * call (no streaming). Goes through the Tauri HTTP plugin so provider APIs that
 * reject browser-origin requests still work.
 */
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

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; fall through to status handling below.
  }

  if (!response.ok) {
    const detail = extractErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
    }
    if (response.status === 429) {
      throw new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
    }
    throw new Error(detail ?? `The AI provider returned an error (HTTP ${response.status})`);
  }

  const { text, toolCalls } = parseAiResponse(settings.aiProvider, payload);
  if (text.length === 0 && toolCalls.length > 0) {
    return JSON.stringify({ tool_calls: toolCalls });
  }
  return text;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

/** Pull the incremental text out of one SSE `data:` payload, per provider. */
function extractDelta(provider: AiProvider, data: string): string {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return "";
  }
  if (typeof json !== "object" || json === null) return "";
  const obj = json as Record<string, unknown>;
  switch (provider) {
    case "anthropic": {
      const delta = (obj as { delta?: { text?: unknown } }).delta;
      return typeof delta?.text === "string" ? delta.text : "";
    }
    case "openai":
    case "custom": {
      const choices = (obj as { choices?: Array<{ delta?: { content?: unknown } }> }).choices;
      const content = choices?.[0]?.delta?.content;
      return typeof content === "string" ? content : "";
    }
    case "gemini": {
      const candidates = (obj as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
      }).candidates;
      const parts = candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return "";
      return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
    }
  }
}

/**
 * Streaming multi-turn generation. Sends `stream: true` and reads the SSE event
 * stream, forwarding each text delta to `cb.onToken`. Returns the full
 * accumulated text. If `response.body` isn't a usable stream (the Tauri plugin
 * may not expose one), falls back to a single non-streamed read so the UI still
 * works. An abort via `cb.signal` resolves with whatever text accumulated so far
 * — it never throws for aborts.
 */
export async function streamChat(
  settings: AiSettings,
  input: ChatInput,
  cb: { onToken?: (chunk: string) => void; signal?: AbortSignal }
): Promise<string> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const request = buildChatRequest(settings, { ...input, stream: true });

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: cb.signal
    });
  } catch (error) {
    if (isAbortError(error)) return "";
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the AI provider: ${detail}`);
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON error body; fall through to status handling.
    }
    const detail = extractErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
    }
    if (response.status === 429) {
      throw new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
    }
    throw new Error(detail ?? `The AI provider returned an error (HTTP ${response.status})`);
  }

  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== "function") {
    // Fallback: no usable stream — read the whole body once and emit it.
    const text = await response.text();
    const { text: parsedText, toolCalls } = parseAiResponse(settings.aiProvider, JSON.parse(text));
    const full =
      parsedText.length === 0 && toolCalls.length > 0
        ? JSON.stringify({ tool_calls: toolCalls })
        : parsedText;
    cb.onToken?.(full);
    return full;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let acc = "";
  try {
    while (true) {
      if (cb.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length === 0 || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const chunk = extractDelta(settings.aiProvider, data);
        if (chunk.length > 0) {
          acc += chunk;
          cb.onToken?.(chunk);
        }
      }
    }
    // Flush any trailing partial line.
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data.length > 0 && data !== "[DONE]") {
        const chunk = extractDelta(settings.aiProvider, data);
        if (chunk.length > 0) {
          acc += chunk;
          cb.onToken?.(chunk);
        }
      }
    }
  } catch (error) {
    if (isAbortError(error)) return acc;
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore — the stream may already be closed.
    }
  }
  return acc;
}

export type StreamCallbacksV2 = {
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
};

/**
 * Streaming multi-turn generation that returns both accumulated text and the
 * native tool calls the model emitted during the stream. Mirrors `streamChat`
 * for text deltas, but adds per-provider streamed tool-call accumulation:
 *
 * - OpenAI/Custom: `delta.tool_calls[].function.{name,arguments}` accumulated
 *   per `index`; arguments JSON parsed once at stream end.
 * - Anthropic: content blocks tracked by `index` across `content_block_start`
 *   / `content_block_delta` / `content_block_stop`; `text_delta` → onToken,
 *   `input_json_delta.partial_json` concatenated into the tool_use block and
 *   parsed when the block stops.
 * - Gemini: text parts streamed via `onToken`; a `functionCall` part in a
 *   streamed candidate becomes a tool call.
 *
 * Falls back to a single non-streamed `parseAiResponse` read when
 * `response.body` isn't a usable stream. An abort via `cb.signal` resolves
 * with whatever accumulated so far — it never throws for aborts.
 */
export async function streamChatV2(
  settings: AiSettings,
  input: ChatInput,
  cb: StreamCallbacksV2
): Promise<{ text: string; toolCalls: ParsedToolCall[] }> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const request = buildChatRequest(settings, { ...input, stream: true });

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: cb.signal
    });
  } catch (error) {
    if (isAbortError(error)) return { text: "", toolCalls: [] };
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the AI provider: ${detail}`);
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON error body; fall through to status handling.
    }
    const detail = extractErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
    }
    if (response.status === 429) {
      throw new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
    }
    throw new Error(detail ?? `The AI provider returned an error (HTTP ${response.status})`);
  }

  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== "function") {
    // Fallback: no usable stream — read the whole body once and parse it.
    const raw = await response.text();
    const parsed = parseAiResponse(settings.aiProvider, JSON.parse(raw));
    const full =
      parsed.text.length === 0 && parsed.toolCalls.length > 0
        ? JSON.stringify({ tool_calls: parsed.toolCalls })
        : parsed.text;
    cb.onToken?.(full);
    return { text: full, toolCalls: parsed.toolCalls };
  }

  const provider = settings.aiProvider;
  let acc = "";
  const toolCalls: ParsedToolCall[] = [];
  // OpenAI / Custom: per-index accumulator for streamed function calls.
  const openaiTools = new Map<number, { name: string; args: string }>();
  // Anthropic: per-index content block tracker.
  const anthropicBlocks = new Map<
    number,
    { type: "text" | "tool_use"; name?: string; argsString: string }
  >();

  function handleData(data: string): void {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof json !== "object" || json === null) return;
    const obj = json as Record<string, unknown>;
    switch (provider) {
      case "openai":
      case "custom": {
        const choices = (
          obj as {
            choices?: Array<{
              delta?: {
                content?: unknown;
                tool_calls?: Array<{
                  index?: number;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          }
        ).choices;
        const choice = choices?.[0];
        if (!choice?.delta) return;
        const delta = choice.delta;
        if (typeof delta.content === "string" && delta.content.length > 0) {
          acc += delta.content;
          cb.onToken?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            if (typeof tc?.index !== "number" || !tc.function) continue;
            const existing = openaiTools.get(tc.index) ?? { name: "", args: "" };
            if (typeof tc.function.name === "string" && tc.function.name.length > 0) {
              existing.name = tc.function.name;
            }
            if (typeof tc.function.arguments === "string") {
              existing.args += tc.function.arguments;
            }
            openaiTools.set(tc.index, existing);
          }
        }
        break;
      }
      case "anthropic": {
        const type = typeof obj.type === "string" ? obj.type : "";
        if (type === "content_block_start") {
          const index = (obj as { index?: number }).index;
          const block = (
            obj as {
              content_block?: { type?: string; name?: string };
            }
          ).content_block;
          if (typeof index !== "number" || !block) return;
          if (block.type === "text") {
            anthropicBlocks.set(index, { type: "text", argsString: "" });
          } else if (block.type === "tool_use") {
            anthropicBlocks.set(index, {
              type: "tool_use",
              name: typeof block.name === "string" ? block.name : "",
              argsString: ""
            });
          }
        } else if (type === "content_block_delta") {
          const index = (obj as { index?: number }).index;
          const delta = (
            obj as {
              delta?: { type?: string; text?: string; partial_json?: string };
            }
          ).delta;
          if (typeof index !== "number" || !delta) return;
          const block = anthropicBlocks.get(index);
          if (!block) return;
          if (delta.type === "text_delta" && typeof delta.text === "string") {
            acc += delta.text;
            cb.onToken?.(delta.text);
          } else if (
            delta.type === "input_json_delta" &&
            typeof delta.partial_json === "string"
          ) {
            block.argsString += delta.partial_json;
          }
        } else if (type === "content_block_stop") {
          const index = (obj as { index?: number }).index;
          if (typeof index !== "number") return;
          const block = anthropicBlocks.get(index);
          if (!block) return;
          if (block.type === "tool_use" && block.name) {
            toolCalls.push({ name: block.name, args: parseArgsObject(block.argsString) });
          }
          anthropicBlocks.delete(index);
        }
        break;
      }
      case "gemini": {
        const candidates = (
          obj as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: { name?: string; args?: Record<string, unknown> };
                }>;
              };
            }>;
          }
        ).candidates;
        const parts = candidates?.[0]?.content?.parts;
        if (!Array.isArray(parts)) return;
        for (const p of parts) {
          if (typeof p.text === "string" && p.text.length > 0) {
            acc += p.text;
            cb.onToken?.(p.text);
          }
          if (p.functionCall && typeof p.functionCall.name === "string") {
            toolCalls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
          }
        }
        break;
      }
    }
  }

  function finalizePending(): void {
    for (const idx of Array.from(openaiTools.keys()).sort((a, b) => a - b)) {
      const entry = openaiTools.get(idx)!;
      if (entry.name) toolCalls.push({ name: entry.name, args: parseArgsObject(entry.args) });
    }
    openaiTools.clear();
    for (const idx of Array.from(anthropicBlocks.keys()).sort((a, b) => a - b)) {
      const block = anthropicBlocks.get(idx)!;
      if (block.type === "tool_use" && block.name) {
        toolCalls.push({ name: block.name, args: parseArgsObject(block.argsString) });
      }
    }
    anthropicBlocks.clear();
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (cb.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length === 0 || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data.length === 0 || data === "[DONE]") continue;
        handleData(data);
      }
    }
    // Flush any trailing partial line.
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data.length > 0 && data !== "[DONE]") handleData(data);
    }
  } catch (error) {
    if (isAbortError(error)) {
      finalizePending();
      return { text: acc, toolCalls };
    }
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore — the stream may already be closed.
    }
  }

  finalizePending();
  return { text: acc, toolCalls };
}

/** Parse accumulated tool-call arguments JSON, tolerating malformed input. */
function parseArgsObject(raw: string): Record<string, unknown> {
  if (raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
