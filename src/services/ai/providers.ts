import type { AiProvider, AppSettings } from "../../types";
import type { ParsedToolCall } from "./assistant/responseParser";

export type { ParsedToolCall };

export type AiRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type AiSettings = Pick<
  AppSettings,
  "aiProvider" | "aiApiKey" | "aiModel" | "aiBaseUrl"
>;

export type GenerateInput = {
  system: string;
  prompt: string;
  maxTokens?: number;
  /**
   * Sampling temperature. Lower values make output more deterministic, so the
   * same input produces near-identical text on regeneration. Omitted lets the
   * provider use its (high) default.
   */
  temperature?: number;
};

export type ChatRole = "user" | "assistant";

/** A tool call the assistant made, carried in structured form so providers with
 *  native tool calling see their own tool_use/tool_call format on replay. */
export type ToolCallPart = { id: string; name: string; args: unknown };

/** The result of one tool call, paired back to the call by id. */
export type ToolResultPart = { id: string; name: string; content: string };

export type ChatTurn = {
  role: ChatRole;
  content: string;
  /** Assistant turns only: native tool calls made in this turn. */
  toolCalls?: ToolCallPart[];
  /** User turns only: results for the preceding assistant turn's tool calls. */
  toolResults?: ToolResultPart[];
};

export type ChatToolSpec = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type ChatInput = {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** When true, build a streaming request (SSE). */
  stream?: boolean;
  /**
   * Optional function declarations for providers with native tool calling.
   * The assistant loop still consumes provider-neutral JSON after parsing.
   */
  tools?: ChatToolSpec[];
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  custom: "Custom (OpenAI-compatible)"
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5.1",
  gemini: "gemini-2.5-flash",
  custom: ""
};

const DEFAULT_MAX_TOKENS = 2048;

export function resolveModel(settings: AiSettings): string {
  const model = settings.aiModel.trim();
  return model.length > 0 ? model : DEFAULT_MODELS[settings.aiProvider];
}

/** Strips a trailing slash so URL joining stays predictable. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function buildOpenAiCompatibleRequest(
  baseUrl: string,
  settings: AiSettings,
  input: GenerateInput
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
        { role: "user", content: input.prompt }
      ],
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
    }
  };
}

export function buildAiRequest(settings: AiSettings, input: GenerateInput): AiRequest {
  switch (settings.aiProvider) {
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
          messages: [{ role: "user", content: input.prompt }],
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
        }
      };
    case "openai":
      return buildOpenAiCompatibleRequest("https://api.openai.com/v1", settings, input);
    case "gemini": {
      const model = resolveModel(settings);
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": settings.aiApiKey
        },
        body: {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          ...(input.temperature !== undefined
            ? { generationConfig: { temperature: input.temperature } }
            : {})
        }
      };
    }
    case "custom": {
      if (normalizeBaseUrl(settings.aiBaseUrl).length === 0) {
        throw new Error("Custom provider needs a base URL (e.g. http://localhost:11434/v1)");
      }
      return buildOpenAiCompatibleRequest(settings.aiBaseUrl, settings, input);
    }
  }
}

function toolArgsObject(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

/** Flatten structured turns into OpenAI chat messages: assistant tool calls become
 *  `tool_calls`, and each tool result becomes its own `role:"tool"` message. */
function toOpenAiMessages(messages: ChatTurn[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const turn of messages) {
    if (turn.role === "assistant" && turn.toolCalls && turn.toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: turn.content.length > 0 ? turn.content : null,
        tool_calls: turn.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(toolArgsObject(call.args)) }
        }))
      });
      continue;
    }
    if (turn.role === "user" && turn.toolResults && turn.toolResults.length > 0) {
      for (const result of turn.toolResults) {
        out.push({ role: "tool", tool_call_id: result.id, content: result.content });
      }
      if (turn.content.length > 0) out.push({ role: "user", content: turn.content });
      continue;
    }
    out.push({ role: turn.role, content: turn.content });
  }
  return out;
}

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
        ...toOpenAiMessages(input.messages)
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

/** Map structured turns to Anthropic content blocks: tool calls become tool_use
 *  blocks on the assistant turn, results become tool_result blocks leading the
 *  next user turn (Anthropic requires results first in the message). */
function toAnthropicMessages(messages: ChatTurn[]): Record<string, unknown>[] {
  return messages.map((turn) => {
    if (turn.role === "assistant" && turn.toolCalls && turn.toolCalls.length > 0) {
      const blocks: Record<string, unknown>[] = [];
      if (turn.content.trim().length > 0) blocks.push({ type: "text", text: turn.content });
      for (const call of turn.toolCalls) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: toolArgsObject(call.args) });
      }
      return { role: "assistant", content: blocks };
    }
    if (turn.role === "user" && turn.toolResults && turn.toolResults.length > 0) {
      const blocks: Record<string, unknown>[] = turn.toolResults.map((result) => ({
        type: "tool_result",
        tool_use_id: result.id,
        content: result.content
      }));
      if (turn.content.trim().length > 0) blocks.push({ type: "text", text: turn.content });
      return { role: "user", content: blocks };
    }
    return { role: turn.role, content: turn.content };
  });
}

/** Map structured turns to Gemini parts: functionCall on model turns,
 *  functionResponse (name-matched — Gemini has no call ids) on user turns. */
function toGeminiContents(messages: ChatTurn[]): Record<string, unknown>[] {
  return messages.map((turn) => {
    const role = turn.role === "assistant" ? "model" : "user";
    if (turn.role === "assistant" && turn.toolCalls && turn.toolCalls.length > 0) {
      const parts: Record<string, unknown>[] = [];
      if (turn.content.trim().length > 0) parts.push({ text: turn.content });
      for (const call of turn.toolCalls) {
        parts.push({ functionCall: { name: call.name, args: toolArgsObject(call.args) } });
      }
      return { role, parts };
    }
    if (turn.role === "user" && turn.toolResults && turn.toolResults.length > 0) {
      const parts: Record<string, unknown>[] = turn.toolResults.map((result) => ({
        functionResponse: { name: result.name, response: { result: result.content } }
      }));
      if (turn.content.trim().length > 0) parts.push({ text: turn.content });
      return { role, parts };
    }
    return { role, parts: [{ text: turn.content }] };
  });
}

export function buildChatRequest(settings: AiSettings, input: ChatInput): AiRequest {
  switch (settings.aiProvider) {
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
          messages: toAnthropicMessages(input.messages),
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
    case "openai":
      return buildOpenAiCompatibleChatRequest("https://api.openai.com/v1", settings, input);
    case "gemini": {
      const model = resolveModel(settings);
      const action = input.stream ? "streamGenerateContent" : "generateContent";
      const query = input.stream ? "?alt=sse" : "";
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}${query}`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": settings.aiApiKey
        },
        body: {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: toGeminiContents(input.messages),
          ...(input.tools && input.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: input.tools.map((tool) => ({
                      name: tool.name,
                      description: tool.description,
                      ...(tool.parameters ? { parameters: tool.parameters } : {})
                    }))
                  }
                ]
              }
            : {}),
          ...(input.temperature !== undefined
            ? { generationConfig: { temperature: input.temperature } }
            : {})
        }
      };
    }
    case "custom": {
      if (normalizeBaseUrl(settings.aiBaseUrl).length === 0) {
        throw new Error("Custom provider needs a base URL (e.g. http://localhost:11434/v1)");
      }
      return buildOpenAiCompatibleChatRequest(settings.aiBaseUrl, settings, input);
    }
  }
}

type AnthropicResponse = {
  stop_reason?: string;
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
};

type OpenAiResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
};

export function parseAiResponse(
  provider: AiProvider,
  payload: unknown
): { text: string; toolCalls: ParsedToolCall[]; truncated: boolean } {
  let text = "";
  let truncated = false;
  const toolCalls: ParsedToolCall[] = [];

  switch (provider) {
    case "anthropic": {
      const response = payload as AnthropicResponse;
      truncated = response.stop_reason === "max_tokens";
      const blocks = response.content ?? [];
      text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      for (const b of blocks) {
        if (b.type === "tool_use" && typeof b.name === "string") {
          toolCalls.push({
            name: b.name,
            args: b.input ?? {},
            ...(typeof b.id === "string" ? { id: b.id } : {})
          });
        }
      }
      break;
    }
    case "openai":
    case "custom": {
      const response = payload as OpenAiResponse;
      const choice = response.choices?.[0];
      truncated = choice?.finish_reason === "length";
      const msg = choice?.message;
      text = msg?.content ?? "";
      const calls = msg?.tool_calls;
      if (Array.isArray(calls)) {
        for (const c of calls) {
          if (typeof c?.function?.name === "string") {
            let args: Record<string, unknown> = {};
            let argsInvalid = false;
            try {
              args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
              argsInvalid = true;
            }
            toolCalls.push({
              name: c.function.name,
              args,
              ...(typeof c.id === "string" ? { id: c.id } : {}),
              ...(argsInvalid ? { argsInvalid: true } : {})
            });
          }
        }
      }
      break;
    }
    case "gemini": {
      const response = payload as GeminiResponse;
      truncated = response.candidates?.[0]?.finishReason === "MAX_TOKENS";
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const calls = parts
        .map((p) => p.functionCall)
        .filter(
          (c): c is { name: string; args?: Record<string, unknown> } => typeof c?.name === "string"
        )
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
  if (trimmed.length === 0 && toolCalls.length === 0 && !truncated) {
    throw new Error("The AI provider returned an empty response");
  }
  return { text: trimmed, toolCalls, truncated };
}

/** True for a 400 caused by a model that only supports its default temperature
 *  (OpenAI GPT-5 / o-series reasoning models, including via compatible proxies). */
export function isUnsupportedTemperatureError(status: number, detail: string | null): boolean {
  return (
    status === 400 &&
    detail !== null &&
    /temperature/i.test(detail) &&
    /unsupported|not support|only the default|invalid/i.test(detail)
  );
}

/** Map a provider HTTP failure to the user-facing error the UI shows. */
export function providerHttpError(status: number, detail: string | null): Error {
  if (status === 401 || status === 403) {
    return new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
  }
  if (status === 429) {
    return new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
  }
  return new Error(detail ?? `The AI provider returned an error (HTTP ${status})`);
}

/** Pulls a human-readable message out of a provider error payload, if any. */
export function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return null;
}
