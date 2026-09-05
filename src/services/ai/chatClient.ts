import { fetch } from "@tauri-apps/plugin-http";
import { withFreshCredential } from "./authSession";
import {
  buildChatRequest,
  extractErrorMessage,
  hasAiKey,
  isUnsupportedTemperatureError,
  parseAiResponse,
  parseResponsesToolCall,
  providerHttpError,
  wireOf,
  type AiSettings,
  type ChatInput,
  type ParsedToolCall
} from "./providers";

/**
 * Multi-turn text generation against the configured provider. Like
 * `generateText`, but takes a full message history. One network round-trip per
 * call (no streaming). Goes through the Tauri HTTP plugin so provider APIs that
 * reject browser-origin requests still work.
 */
export async function generateChat(
  stored: AiSettings,
  input: ChatInput,
  signal?: AbortSignal
): Promise<string> {
  if (!hasAiKey(stored)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const settings = await withFreshCredential(stored);
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
    // Some models (OpenAI GPT-5 / o-series reasoning models, including via
    // OpenAI-compatible proxies) reject any non-default temperature with a 400.
    // Retry once without it instead of failing the whole turn.
    if (isUnsupportedTemperatureError(response.status, detail) && input.temperature !== undefined) {
      return generateChat(settings, { ...input, temperature: undefined }, signal);
    }
    throw providerHttpError(response.status, detail);
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

export type StreamCallbacksV2 = {
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
};

/**
 * Streaming multi-turn generation that returns both accumulated text and the
 * native tool calls the model emitted during the stream. Streams each text
 * delta to `cb.onToken` and adds per-provider streamed tool-call accumulation:
 *
 * - OpenAI-compatible: `delta.tool_calls[].function.{name,arguments}` accumulated
 *   per `index`; arguments JSON parsed once at stream end.
 * - Anthropic: content blocks tracked by `index` across `content_block_start`
 *   / `content_block_delta` / `content_block_stop`; `text_delta` → onToken,
 *   `input_json_delta.partial_json` concatenated into the tool_use block and
 *   parsed when the block stops.
 * - Gemini: text parts streamed via `onToken`; a `functionCall` part in a
 *   streamed candidate becomes a tool call.
 * - Responses (the Codex endpoint): `response.output_text.delta` → onToken;
 *   a completed `function_call` output item becomes a tool call; a
 *   `response.failed` event carries the provider's error, raised once the
 *   stream ends.
 *
 * Falls back to a single non-streamed `parseAiResponse` read when
 * `response.body` isn't a usable stream. An abort via `cb.signal` resolves
 * with whatever accumulated so far — it never throws for aborts.
 */
export async function streamChatV2(
  stored: AiSettings,
  input: ChatInput,
  cb: StreamCallbacksV2
): Promise<{ text: string; toolCalls: ParsedToolCall[]; truncated: boolean }> {
  if (!hasAiKey(stored)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const settings = await withFreshCredential(stored);
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
    if (isAbortError(error)) return { text: "", toolCalls: [], truncated: false };
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
    if (isUnsupportedTemperatureError(response.status, detail) && input.temperature !== undefined) {
      return streamChatV2(settings, { ...input, temperature: undefined }, cb);
    }
    throw providerHttpError(response.status, detail);
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
    if (parsed.text.length > 0) {
      cb.onToken?.(full);
    }
    return { text: full, toolCalls: parsed.toolCalls, truncated: parsed.truncated };
  }

  const wire = wireOf(settings.aiProvider);
  let acc = "";
  let truncated = false;
  const toolCalls: ParsedToolCall[] = [];
  // OpenAI-compatible: per-index accumulator for streamed function calls.
  const openaiTools = new Map<number, { id?: string; name: string; args: string }>();
  // Anthropic: per-index content block tracker.
  const anthropicBlocks = new Map<
    number,
    { type: "text" | "tool_use"; id?: string; name?: string; argsString: string }
  >();
  // Responses: an error event ends the turn, but only after the read loop has
  // drained — throwing from inside the parser would leak the reader.
  let streamFailure: string | null = null;

  function handleData(data: string): void {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof json !== "object" || json === null) return;
    const obj = json as Record<string, unknown>;
    switch (wire) {
      case "openai": {
        const choices = (
          obj as {
            choices?: Array<{
              finish_reason?: string;
              delta?: {
                content?: unknown;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          }
        ).choices;
        const choice = choices?.[0];
        if (choice?.finish_reason === "length") truncated = true;
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
            if (typeof tc.id === "string" && tc.id.length > 0) {
              existing.id = tc.id;
            }
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
              content_block?: { type?: string; id?: string; name?: string };
            }
          ).content_block;
          if (typeof index !== "number" || !block) return;
          if (block.type === "text") {
            anthropicBlocks.set(index, { type: "text", argsString: "" });
          } else if (block.type === "tool_use") {
            anthropicBlocks.set(index, {
              type: "tool_use",
              ...(typeof block.id === "string" ? { id: block.id } : {}),
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
            toolCalls.push(toParsedCall(block.name, block.argsString, block.id));
          }
          anthropicBlocks.delete(index);
        } else if (type === "message_delta") {
          const delta = (obj as { delta?: { stop_reason?: string } }).delta;
          if (delta?.stop_reason === "max_tokens") truncated = true;
        }
        break;
      }
      case "responses": {
        const type = typeof obj.type === "string" ? obj.type : "";
        if (type === "response.output_text.delta") {
          const delta = (obj as { delta?: unknown }).delta;
          if (typeof delta === "string" && delta.length > 0) {
            acc += delta;
            cb.onToken?.(delta);
          }
        } else if (type === "response.output_item.done") {
          const item = (obj as { item?: { type?: string; name?: string } }).item;
          if (item?.type === "function_call" && typeof item.name === "string") {
            toolCalls.push(parseResponsesToolCall(item));
          }
        } else if (type === "response.incomplete") {
          const reason = (
            obj as { response?: { incomplete_details?: { reason?: string } } }
          ).response?.incomplete_details?.reason;
          if (reason === "max_output_tokens") truncated = true;
        } else if (type === "response.failed" || type === "error") {
          const message =
            (obj as { response?: { error?: { message?: string } } }).response?.error?.message ??
            (obj as { error?: { message?: string } }).error?.message;
          streamFailure = message ?? "The AI provider ended the stream with an error";
        }
        break;
      }
      case "gemini": {
        const candidates = (
          obj as {
            candidates?: Array<{
              finishReason?: string;
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: { name?: string; args?: Record<string, unknown> };
                }>;
              };
            }>;
          }
        ).candidates;
        if (candidates?.[0]?.finishReason === "MAX_TOKENS") truncated = true;
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
      if (entry.name) {
        toolCalls.push(toParsedCall(entry.name, entry.args, entry.id));
      }
    }
    openaiTools.clear();
    for (const idx of Array.from(anthropicBlocks.keys()).sort((a, b) => a - b)) {
      const block = anthropicBlocks.get(idx)!;
      if (block.type === "tool_use" && block.name) {
        toolCalls.push(toParsedCall(block.name, block.argsString, block.id));
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
      return { text: acc, toolCalls, truncated };
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
  if (streamFailure !== null) throw new Error(streamFailure);
  return { text: acc, toolCalls, truncated };
}

/** Build a ParsedToolCall from accumulated argument JSON. Malformed args (a
 *  truncated or garbled stream) are flagged rather than silently coerced to {},
 *  which for all-optional-args tools would execute with defaults. */
function toParsedCall(name: string, rawArgs: string, id?: string): ParsedToolCall {
  let args: Record<string, unknown> = {};
  let argsInvalid = false;
  if (rawArgs.length > 0) {
    try {
      const parsed = JSON.parse(rawArgs);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        argsInvalid = true;
      }
    } catch {
      argsInvalid = true;
    }
  }
  return { name, args, ...(id ? { id } : {}), ...(argsInvalid ? { argsInvalid: true } : {}) };
}
