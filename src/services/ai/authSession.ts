import { useSettingsStore } from "../../stores/settingsStore";
import { planTokenRefresh } from "./credentials";
import { needsRefresh, refreshTokens } from "./oauth";
import { oauthConfig } from "./providerCatalog";
import type { AiSettings } from "./providers";

/**
 * Keeps a signed-in credential usable.
 *
 * Pasted API keys never expire, so for almost every provider this is a no-op
 * on a fast path. Providers whose sign-in returns OAuth tokens (the
 * ChatGPT/Codex endpoint) hand back an access token that lasts hours: this is
 * what re-mints it from the refresh token, persists the new one, and returns
 * settings carrying it — so callers never see an expired token.
 *
 * Every AI entry point funnels through here, which is also why the refresh is
 * de-duplicated: a turn that fires the assistant and a background memory review
 * at once must not race two refreshes and have one invalidate the other.
 */

/** One in-flight refresh per provider, shared by everything that asks. */
const inFlight = new Map<string, Promise<AiSettings>>();

export async function withFreshCredential(settings: AiSettings): Promise<AiSettings> {
  const config = oauthConfig(settings.aiProvider);
  if (!config || config.exchange !== "tokens") return settings;

  const stored = settings.aiProviderConfigs?.[settings.aiProvider];
  if (!stored?.refreshToken || !needsRefresh(stored.expiresAt)) return settings;

  const pending = inFlight.get(settings.aiProvider);
  if (pending) return pending;

  const refresh = (async () => {
    const result = await refreshTokens(config, stored.refreshToken as string).catch(
      (error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Your ${settings.aiProvider} sign-in expired and could not be renewed (${detail}) — sign in again in Settings → Assistant`
        );
      }
    );

    // Persist against the *live* settings rather than the snapshot passed in,
    // which may be stale by the time the network call comes back.
    const live = useSettingsStore.getState().settings;
    const patch = planTokenRefresh(live, settings.aiProvider, {
      key: result.apiKey,
      ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
      ...(result.expiresAt !== undefined ? { expiresAt: result.expiresAt } : {}),
      ...(result.accountId ? { accountId: result.accountId } : {})
    });
    await useSettingsStore.getState().updateSettings(patch);

    return {
      ...settings,
      aiApiKey: result.apiKey,
      aiProviderConfigs: patch.aiProviderConfigs ?? settings.aiProviderConfigs
    };
  })();

  inFlight.set(settings.aiProvider, refresh);
  try {
    return await refresh;
  } finally {
    inFlight.delete(settings.aiProvider);
  }
}
