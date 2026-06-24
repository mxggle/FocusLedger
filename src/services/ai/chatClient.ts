import { fetch } from "@tauri-apps/plugin-http";
import { hasAiKey } from "./aiClient";
import {
  buildChatRequest,
  extractErrorMessage,
  parseAiResponse,
  type AiSettings,
  type ChatInput
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

  const { text } = parseAiResponse(settings.aiProvider, payload);
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
    const parsed = parseAiResponse(settings.aiProvider, JSON.parse(text));
    const full = parsed.text;
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
