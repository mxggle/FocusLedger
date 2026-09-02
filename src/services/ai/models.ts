import type { AiProvider } from "../../types";
import type { AiSettings } from "./providers";

/** One entry in the model dropdown. */
export type ModelOption = {
  id: string;
  label: string;
  /** Short positioning note ("Balanced", "Fastest") shown next to the label. */
  hint?: string;
};

/**
 * The shortlist we vouch for per provider. It is the whole menu offline and the
 * top of the menu once the provider's own catalog loads, so the common choice
 * is one click away instead of buried in a hundred ids.
 */
export const CURATED_MODELS: Record<AiProvider, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-5", label: "Claude Opus 5", hint: "Most capable" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fastest, cheapest" }
  ],
  openai: [
    { id: "gpt-5.1", label: "GPT-5.1", hint: "Most capable" },
    { id: "gpt-5.1-mini", label: "GPT-5.1 mini", hint: "Balanced" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Fastest, cheapest" }
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Most capable" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", hint: "Fastest, cheapest" }
  ],
  // Self-hosted endpoints serve whatever they were started with; the live
  // listing below is the only honest catalog for them.
  custom: []
};

/** A GET request against a provider's "list models" endpoint. */
export type ModelsRequest = { url: string; headers: Record<string, string> };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * Builds the request that asks the provider which models the key can use.
 * Returns null when we can't ask (no key yet, or a custom endpoint with no
 * base URL) — callers fall back to `CURATED_MODELS`.
 */
export function buildModelsRequest(settings: AiSettings): ModelsRequest | null {
  const key = settings.aiApiKey.trim();
  if (key.length === 0) return null;

  switch (settings.aiProvider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=100",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${key}` }
      };
    case "gemini":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
        headers: { "x-goog-api-key": key }
      };
    case "custom": {
      const baseUrl = normalizeBaseUrl(settings.aiBaseUrl);
      if (baseUrl.length === 0) return null;
      return {
        url: `${baseUrl}/models`,
        headers: { Authorization: `Bearer ${key}` }
      };
    }
  }
}

type AnthropicModelsResponse = {
  data?: Array<{ id?: unknown; display_name?: unknown }>;
};

type OpenAiModelsResponse = {
  data?: Array<{ id?: unknown }>;
};

type GeminiModelsResponse = {
  models?: Array<{
    name?: unknown;
    displayName?: unknown;
    supportedGenerationMethods?: unknown;
  }>;
};

/** Model ids that can't answer a chat turn (embeddings, audio, images, …). */
const NON_CHAT_MODEL = /embed|whisper|tts|audio|image|dall-e|moderation|rerank|guard|search|sora|realtime|transcribe/i;

/**
 * Turns a provider's catalog payload into dropdown entries. Unknown shapes and
 * junk entries are dropped rather than thrown on — a listing that half-parses
 * is still more useful than no listing.
 */
export function parseModelsResponse(provider: AiProvider, payload: unknown): ModelOption[] {
  if (typeof payload !== "object" || payload === null) return [];

  switch (provider) {
    case "anthropic": {
      const rows = (payload as AnthropicModelsResponse).data ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.id !== "string") return [];
        const label = typeof row.display_name === "string" ? row.display_name : row.id;
        return [{ id: row.id, label }];
      });
    }
    case "openai":
    case "custom": {
      const rows = (payload as OpenAiModelsResponse).data ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.id !== "string") return [];
        // OpenAI's list mixes in embeddings and audio models; a self-hosted
        // endpoint usually only serves chat models, so filter either way.
        if (NON_CHAT_MODEL.test(row.id)) return [];
        return [{ id: row.id, label: row.id }];
      });
    }
    case "gemini": {
      const rows = (payload as GeminiModelsResponse).models ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.name !== "string") return [];
        const methods = Array.isArray(row.supportedGenerationMethods)
          ? row.supportedGenerationMethods
          : [];
        if (!methods.includes("generateContent")) return [];
        const id = row.name.replace(/^models\//, "");
        if (NON_CHAT_MODEL.test(id)) return [];
        const label = typeof row.displayName === "string" ? row.displayName : id;
        return [{ id, label }];
      });
    }
  }
}

/**
 * Curated entries first (in our order, keeping their hints), then everything
 * else the provider reported, alphabetically. Ids appear once.
 */
export function mergeModelOptions(
  curated: ModelOption[],
  fetched: ModelOption[]
): ModelOption[] {
  const seen = new Set<string>();
  const merged: ModelOption[] = [];
  const available = new Set(fetched.map((option) => option.id));

  for (const option of curated) {
    // Offline (nothing fetched) we show the whole shortlist; once we know what
    // the key can actually reach, drop the ones it can't.
    if (fetched.length > 0 && !available.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }

  const rest = fetched
    .filter((option) => !seen.has(option.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return [...merged, ...rest];
}
