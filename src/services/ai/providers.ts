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

export type ChatTurn = { role: ChatRole; content: string };

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
  anthropic: "claude-opus-4-8",
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
          contents: input.messages.map((turn) => ({
            role: turn.role === "assistant" ? "model" : "user",
            parts: [{ text: turn.content }]
          })),
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
  content?: Array<{
    type: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
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
): { text: string; toolCalls: ParsedToolCall[] } {
  let text = "";
  const toolCalls: ParsedToolCall[] = [];

  switch (provider) {
    case "anthropic": {
      const response = payload as AnthropicResponse;
      const blocks = response.content ?? [];
      text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
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
            let args: Record<string, unknown> = {};
            try {
              args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
              args = {};
            }
            toolCalls.push({ name: c.function.name, args });
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
  if (trimmed.length === 0 && toolCalls.length === 0) {
    throw new Error("The AI provider returned an empty response");
  }
  return { text: trimmed, toolCalls };
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
