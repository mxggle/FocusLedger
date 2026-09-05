import type { AiProvider } from "../../types";
import {
  CODEX_CLIENT_VERSION,
  PROVIDERS,
  requiresApiKey,
  resolveBaseUrl,
  type AiWireProtocol
} from "./providerCatalog";
import type { AiSettings } from "./providers";
import { wireOf } from "./providers";

/** One entry in the model dropdown. */
export type ModelOption = {
  id: string;
  label: string;
  /** Short positioning note ("Balanced", "Fastest") shown next to the label. */
  hint?: string;
};

/**
 * The shortlist we vouch for per provider, read straight off the catalog. It
 * is the whole menu offline and the top of the menu once the provider's own
 * listing loads, so the common choice is one click away instead of buried in a
 * hundred ids. Providers that serve whatever they were started with (local
 * runtimes, custom endpoints) ship no shortlist — the live listing below is
 * the only honest catalog for them.
 */
export const CURATED_MODELS: Record<AiProvider, ModelOption[]> = Object.fromEntries(
  (Object.keys(PROVIDERS) as AiProvider[]).map((id) => [id, PROVIDERS[id].models])
) as Record<AiProvider, ModelOption[]>;

/** A GET request against a provider's "list models" endpoint. */
export type ModelsRequest = { url: string; headers: Record<string, string> };

/**
 * Builds the request that asks the provider which models the key can use.
 * Returns null when we can't ask — no key for a provider that needs one, or an
 * endpoint we have no URL for — and callers fall back to `CURATED_MODELS`.
 */
export function buildModelsRequest(settings: AiSettings): ModelsRequest | null {
  const key = settings.aiApiKey.trim();
  if (key.length === 0 && requiresApiKey(settings.aiProvider)) return null;

  let baseUrl: string;
  try {
    baseUrl = resolveBaseUrl(settings.aiProvider, settings.aiBaseUrl);
  } catch {
    // A custom endpoint with no URL yet — nothing to ask.
    return null;
  }

  const extra = PROVIDERS[settings.aiProvider].headers ?? {};
  switch (wireOf(settings.aiProvider)) {
    case "anthropic":
      return {
        url: `${baseUrl}/models?limit=100`,
        headers: { ...extra, "x-api-key": key, "anthropic-version": "2023-06-01" }
      };
    case "gemini":
      return {
        url: `${baseUrl}/models?pageSize=200`,
        headers: { ...extra, "x-goog-api-key": key }
      };
    case "responses": {
      // The Codex endpoint does publish a catalog, but only to a client that
      // names its version — without the parameter it 400s. It also rotates its
      // lineup faster than a shipped shortlist can track, so asking is the only
      // way the picker offers models that still exist.
      const account = settings.aiProviderConfigs?.[settings.aiProvider]?.accountId;
      return {
        url: `${baseUrl}/models?client_version=${encodeURIComponent(CODEX_CLIENT_VERSION)}`,
        headers: {
          ...extra,
          Authorization: `Bearer ${key}`,
          ...(account ? { "chatgpt-account-id": account } : {})
        }
      };
    }
    case "openai":
      return {
        url: `${baseUrl}/models`,
        // Local runtimes take no credential; sending an empty bearer makes some
        // of them 401 a request that would otherwise have worked.
        headers: key.length > 0 ? { ...extra, Authorization: `Bearer ${key}` } : { ...extra }
      };
  }
}

type AnthropicModelsResponse = {
  data?: Array<{ id?: unknown; display_name?: unknown }>;
};

type OpenAiModelsResponse = {
  data?: Array<{ id?: unknown }>;
};

type CodexModelsResponse = {
  models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown }>;
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

  return parseByWire(wireOf(provider), payload);
}

function parseByWire(wire: AiWireProtocol, payload: unknown): ModelOption[] {
  switch (wire) {
    case "anthropic": {
      const rows = (payload as AnthropicModelsResponse).data ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.id !== "string") return [];
        const label = typeof row.display_name === "string" ? row.display_name : row.id;
        return [{ id: row.id, label }];
      });
    }
    case "openai": {
      const rows = (payload as OpenAiModelsResponse).data ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.id !== "string") return [];
        // OpenAI's list mixes in embeddings and audio models; a self-hosted
        // endpoint usually only serves chat models, so filter either way.
        if (NON_CHAT_MODEL.test(row.id)) return [];
        return [{ id: row.id, label: row.id }];
      });
    }
    case "responses": {
      const rows = (payload as CodexModelsResponse).models ?? [];
      return rows.flatMap((row) => {
        if (typeof row?.slug !== "string") return [];
        // The catalog carries internal entries (an auto-review model, capacity
        // reserves) that the CLI keeps out of its own picker; `visibility`
        // marks them, and they can't answer a chat turn here either.
        if (row.visibility !== "list") return [];
        const label = typeof row.display_name === "string" ? row.display_name : row.slug;
        return [{ id: row.slug, label }];
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
