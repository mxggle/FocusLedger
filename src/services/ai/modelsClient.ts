import { fetch } from "@tauri-apps/plugin-http";
import { withFreshCredential } from "./authSession";
import { buildModelsRequest, parseModelsResponse, type ModelOption } from "./models";
import { extractErrorMessage, providerHttpError, type AiSettings } from "./providers";

/**
 * Catalogs already fetched this session, keyed by what the request depends on.
 * Two pickers on the same page (assistant model, memory model) share one
 * round-trip, and re-opening Settings doesn't re-ask.
 */
const cache = new Map<string, Promise<ModelOption[]>>();

function cacheKey(settings: AiSettings): string {
  return [settings.aiProvider, settings.aiBaseUrl.trim(), settings.aiApiKey.trim()].join(" ");
}

/**
 * Asks the provider which models this key can use. Rejects when we can't ask or
 * the provider refuses, so the picker can fall back to its curated shortlist
 * and say so instead of pretending the list is complete.
 */
export async function fetchModels(settings: AiSettings): Promise<ModelOption[]> {
  const key = cacheKey(settings);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = loadModels(settings);
  cache.set(key, pending);
  // A failed lookup shouldn't be remembered; the next open should retry.
  pending.catch(() => cache.delete(key));
  return pending;
}

/** Drops the cached catalog so the next `fetchModels` asks the provider again. */
export function invalidateModels(settings: AiSettings): void {
  cache.delete(cacheKey(settings));
}

async function loadModels(stored: AiSettings): Promise<ModelOption[]> {
  const settings = await withFreshCredential(stored);
  const request = buildModelsRequest(settings);
  if (!request) {
    throw new Error(
      "Add an API key — or an endpoint, for a local model — to list what this provider offers"
    );
  }

  let response: Response;
  try {
    response = await fetch(request.url, { method: "GET", headers: request.headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the AI provider: ${detail}`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; the status handling below carries the useful error.
  }

  if (!response.ok) {
    throw providerHttpError(response.status, extractErrorMessage(payload));
  }

  return parseModelsResponse(settings.aiProvider, payload);
}
