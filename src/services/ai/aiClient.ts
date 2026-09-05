import { fetch } from "@tauri-apps/plugin-http";
import { withFreshCredential } from "./authSession";
import { streamChatV2 } from "./chatClient";
import { PROVIDERS } from "./providerCatalog";
import {
  buildAiRequest,
  extractErrorMessage,
  hasAiKey,
  isUnsupportedTemperatureError,
  parseAiResponse,
  providerHttpError,
  type AiSettings,
  type GenerateInput
} from "./providers";

export { hasAiKey };

/**
 * One-shot text generation against the configured provider. Uses the Tauri
 * HTTP plugin (requests go through Rust) so provider APIs that reject
 * browser-origin requests still work.
 */
export async function generateText(
  stored: AiSettings,
  input: GenerateInput
): Promise<string> {
  if (!hasAiKey(stored)) {
    throw new Error("Add an API key in Settings → AI to use AI features");
  }

  // A signed-in credential may have aged out since it was stored.
  const settings = await withFreshCredential(stored);

  // Some endpoints (the ChatGPT/Codex backend) only answer as a stream. Read
  // one to its end rather than keeping a second, unsupported request shape.
  if (PROVIDERS[settings.aiProvider].streamOnly) {
    const { text } = await streamChatV2(
      settings,
      {
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
        ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
      },
      {}
    );
    if (text.trim().length === 0) {
      throw new Error("The AI provider returned an empty response");
    }
    return text.trim();
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
