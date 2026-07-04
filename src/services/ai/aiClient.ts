import { fetch } from "@tauri-apps/plugin-http";
import {
  buildAiRequest,
  extractErrorMessage,
  isUnsupportedTemperatureError,
  parseAiResponse,
  providerHttpError,
  type AiSettings,
  type GenerateInput
} from "./providers";

export function hasAiKey(settings: AiSettings): boolean {
  return settings.aiApiKey.trim().length > 0;
}

/**
 * One-shot text generation against the configured provider. Uses the Tauri
 * HTTP plugin (requests go through Rust) so provider APIs that reject
 * browser-origin requests still work.
 */
export async function generateText(settings: AiSettings, input: GenerateInput): Promise<string> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use AI features");
  }

  const request = buildAiRequest(settings, input);

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body)
    });
  } catch (error) {
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
    // Some models reject any non-default temperature; retry once without it.
    if (isUnsupportedTemperatureError(response.status, detail) && input.temperature !== undefined) {
      return generateText(settings, { ...input, temperature: undefined });
    }
    throw providerHttpError(response.status, detail);
  }

  const { text } = parseAiResponse(settings.aiProvider, payload);
  return text;
}
