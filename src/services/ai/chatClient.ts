import { fetch } from "@tauri-apps/plugin-http";
import { hasAiKey } from "./aiClient";
import {
  buildChatRequest,
  extractErrorMessage,
  parseAiResponse,
  type AiSettings,
  type ChatInput
} from "./providers";

/**
 * Multi-turn text generation against the configured provider. Like
 * `generateText`, but takes a full message history. One network round-trip per
 * call (no streaming). Goes through the Tauri HTTP plugin so provider APIs that
 * reject browser-origin requests still work.
 */
export async function generateChat(settings: AiSettings, input: ChatInput): Promise<string> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const request = buildChatRequest(settings, input);

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
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
    }
    if (response.status === 429) {
      throw new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
    }
    throw new Error(detail ?? `The AI provider returned an error (HTTP ${response.status})`);
  }

  return parseAiResponse(settings.aiProvider, payload);
}
