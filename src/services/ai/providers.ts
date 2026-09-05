import type { AiProvider, AppSettings } from "../../types";
import {
  PROVIDERS,
  requiresApiKey,
  resolveBaseUrl,
  type AiWireProtocol
} from "./providerCatalog";
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
> &
  // Optional so anything holding the live four can still be passed straight in.
  // Providers whose API wants the account named (the ChatGPT/Codex endpoint)
  // read it from here; everyone else ignores it.
  Partial<Pick<AppSettings, "aiProviderConfigs">>;

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

function mapProviders<T>(pick: (id: AiProvider) => T): Record<AiProvider, T> {
  const ids = Object.keys(PROVIDERS) as AiProvider[];
  return Object.fromEntries(ids.map((id) => [id, pick(id)])) as Record<AiProvider, T>;
}

export const PROVIDER_LABELS: Record<AiProvider, string> = mapProviders(
  (id) => PROVIDERS[id].label
);

export const DEFAULT_MODELS: Record<AiProvider, string> = mapProviders(
  (id) => PROVIDERS[id].defaultModel
);

const DEFAULT_MAX_TOKENS = 2048;

export function resolveModel(settings: AiSettings): string {
  const model = settings.aiModel.trim();
  return model.length > 0 ? model : DEFAULT_MODELS[settings.aiProvider];
}

/**
 * True when the provider has the credential it needs. Local runtimes (Ollama,
 * LM Studio) take none, so "no key" is a valid, fully working configuration
 * for them rather than a reason to refuse the request.
 */
export function hasAiKey(settings: AiSettings): boolean {
  return settings.aiApiKey.trim().length > 0 || !requiresApiKey(settings.aiProvider);
}

/** The wire protocol the configured provider speaks. */
export function wireOf(provider: AiProvider): AiWireProtocol {
  return PROVIDERS[provider].wire;
}

/**
 * Auth + provider-specific headers for one request. Local runtimes take no
 * credential, so they get no `Authorization` header at all rather than an
 * empty bearer token some servers reject.
 */
function authHeaders(settings: AiSettings): Record<string, string> {
  const def = PROVIDERS[settings.aiProvider];
  const key = settings.aiApiKey.trim();
  const extra = def.headers ?? {};
  if (!requiresApiKey(settings.aiProvider) && key.length === 0) {
    return { ...extra };
  }
  switch (def.wire) {
    case "anthropic":
      return { ...extra, "x-api-key": key, "anthropic-version": "2023-06-01" };
    case "gemini":
      return { ...extra, "x-goog-api-key": key };
    case "openai":
      return { ...extra, Authorization: `Bearer ${key}` };
    case "responses": {
      const account = accountId(settings);
      return {
        ...extra,
        Authorization: `Bearer ${key}`,
        // One id per request, as the endpoint expects; it correlates the
        // turns of a stream, not conversations across calls.
        session_id: crypto.randomUUID(),
        ...(account ? { "chatgpt-account-id": account } : {})
      };
    }
  }
}

/**
 * The account a signed-in credential belongs to, when we know it. The Codex
 * endpoint serves several accounts behind one token and wants to be told which.
 */
function accountId(settings: AiSettings): string | undefined {
  return settings.aiProviderConfigs?.[settings.aiProvider]?.accountId;
}

/** Base URL for the active provider, honouring a user override where allowed. */
function baseUrlOf(settings: AiSettings): string {
  return resolveBaseUrl(settings.aiProvider, settings.aiBaseUrl);
}

function buildOpenAiCompatibleRequest(
  settings: AiSettings,
  input: GenerateInput
): AiRequest {
  return {
    url: `${baseUrlOf(settings)}/chat/completions`,
    headers: { "Content-Type": "application/json", ...authHeaders(settings) },
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
  switch (wireOf(settings.aiProvider)) {
    case "anthropic":
      return {
        url: `${baseUrlOf(settings)}/messages`,
        headers: { "Content-Type": "application/json", ...authHeaders(settings) },
        body: {
          model: resolveModel(settings),
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: input.system,
          messages: [{ role: "user", content: input.prompt }],
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
        }
      };
    case "gemini": {
      const model = resolveModel(settings);
      return {
        url: `${baseUrlOf(settings)}/models/${model}:generateContent`,
        headers: { "Content-Type": "application/json", ...authHeaders(settings) },
        body: {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          ...(input.temperature !== undefined
            ? { generationConfig: { temperature: input.temperature } }
            : {})
        }
      };
    }
    case "openai":
      return buildOpenAiCompatibleRequest(settings, input);
    case "responses":
      // The endpoint has one shape for everything; a one-shot prompt is just a
      // conversation of length one. `generateText` reads the stream to its end.
      return buildResponsesRequest(settings, {
        system: input.system,
        messages: [{ role: "user", content: input.prompt }]
      });
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
  settings: AiSettings,
  input: ChatInput
): AiRequest {
  return {
    url: `${baseUrlOf(settings)}/chat/completions`,
    headers: { "Content-Type": "application/json", ...authHeaders(settings) },
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

/**
 * Map structured turns to Responses API items. Unlike chat completions, tool
 * calls and their results are top-level items rather than fields on a message,
 * paired by `call_id`.
 */
function toResponsesInput(messages: ChatTurn[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const turn of messages) {
    if (turn.role === "assistant" && turn.toolCalls && turn.toolCalls.length > 0) {
      if (turn.content.trim().length > 0) {
        out.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: turn.content }]
        });
      }
      for (const call of turn.toolCalls) {
        out.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(toolArgsObject(call.args))
        });
      }
      continue;
    }
    if (turn.role === "user" && turn.toolResults && turn.toolResults.length > 0) {
      for (const result of turn.toolResults) {
        out.push({ type: "function_call_output", call_id: result.id, output: result.content });
      }
      if (turn.content.trim().length > 0) {
        out.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: turn.content }]
        });
      }
      continue;
    }
    out.push({
      type: "message",
      role: turn.role,
      content: [
        {
          type: turn.role === "assistant" ? "output_text" : "input_text",
          text: turn.content
        }
      ]
    });
  }
  return out;
}

/**
 * The Responses API as the Codex endpoint serves it: always streamed, never
 * server-side stored, with the system prompt as `instructions`. Temperature is
 * left off — the models behind this endpoint reject anything but their default,
 * and omitting it saves a round-trip we would only have to retry.
 */
function buildResponsesRequest(settings: AiSettings, input: ChatInput): AiRequest {
  return {
    url: `${baseUrlOf(settings)}/responses`,
    headers: { "Content-Type": "application/json", ...authHeaders(settings) },
    body: {
      model: resolveModel(settings),
      instructions: input.system,
      input: toResponsesInput(input.messages),
      stream: true,
      store: false,
      ...(input.tools && input.tools.length > 0
        ? {
            tools: input.tools.map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters ?? { type: "object", properties: {} }
            })),
            tool_choice: "auto"
          }
        : {})
    }
  };
}

export function buildChatRequest(settings: AiSettings, input: ChatInput): AiRequest {
  switch (wireOf(settings.aiProvider)) {
    case "anthropic":
      return {
        url: `${baseUrlOf(settings)}/messages`,
        headers: { "Content-Type": "application/json", ...authHeaders(settings) },
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
    case "gemini": {
      const model = resolveModel(settings);
      const action = input.stream ? "streamGenerateContent" : "generateContent";
      const query = input.stream ? "?alt=sse" : "";
      return {
        url: `${baseUrlOf(settings)}/models/${model}:${action}${query}`,
        headers: { "Content-Type": "application/json", ...authHeaders(settings) },
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
    case "openai":
      return buildOpenAiCompatibleChatRequest(settings, input);
    case "responses":
      return buildResponsesRequest(settings, input);
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

type ResponsesItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesResponse = {
  output?: ResponsesItem[];
  incomplete_details?: { reason?: string };
};

/**
 * One `function_call` item. Malformed arguments are flagged rather than coerced
 * to `{}`, which for all-optional-args tools would run with defaults.
 */
export function parseResponsesToolCall(item: ResponsesItem): ParsedToolCall {
  let args: Record<string, unknown> = {};
  let argsInvalid = false;
  try {
    const parsed = item.arguments ? JSON.parse(item.arguments) : {};
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    } else {
      argsInvalid = true;
    }
  } catch {
    argsInvalid = true;
  }
  return {
    name: item.name as string,
    args,
    ...(typeof item.call_id === "string" ? { id: item.call_id } : {}),
    ...(argsInvalid ? { argsInvalid: true } : {})
  };
}

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

  switch (wireOf(provider)) {
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
    case "openai": {
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
    case "responses": {
      const response = payload as ResponsesResponse;
      truncated = response.incomplete_details?.reason === "max_output_tokens";
      for (const item of response.output ?? []) {
        if (item.type === "function_call" && typeof item.name === "string") {
          toolCalls.push(parseResponsesToolCall(item));
        } else if (item.type === "message") {
          text += (item.content ?? [])
            .filter((part) => part.type === "output_text")
            .map((part) => part.text ?? "")
            .join("");
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
