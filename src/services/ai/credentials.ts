import type { AiProvider, AiProviderConfig, AppSettings } from "../../types";

/**
 * The provider-configuration bookkeeping, kept pure so the rules are testable
 * away from the settings UI.
 *
 * `aiApiKey` / `aiModel` / `aiBaseUrl` are the *live* configuration — every AI
 * code path reads them, and none of them needs to know a vault exists.
 * `aiProviderConfigs` is that vault: what each provider was last set up with.
 * Switching providers writes the live values back to the old provider's entry
 * and loads the new one's, so trying a second provider and coming back doesn't
 * mean pasting a key again. Banking-before-restoring is also why configurations
 * saved before the vault existed need no migration: the first switch away from
 * a provider is what files its key.
 */

/** The live settings a provider entry mirrors. */
export type ProviderCredentials = Pick<
  AppSettings,
  "aiProvider" | "aiApiKey" | "aiModel" | "aiBaseUrl" | "aiProviderConfigs"
>;

/** What is remembered for a provider (empty object when nothing is). */
export function providerConfig(
  settings: ProviderCredentials,
  provider: AiProvider
): AiProviderConfig {
  return settings.aiProviderConfigs[provider] ?? {};
}

/** True when the active provider's key came from a sign-in, not the keyboard. */
export function isOauthKey(settings: ProviderCredentials): boolean {
  return (
    settings.aiApiKey.trim().length > 0 &&
    providerConfig(settings, settings.aiProvider).oauth === true
  );
}

/**
 * Drops fields that are empty, so an entry the user cleared out disappears
 * instead of lingering as `{ key: "" }`.
 */
function compact(config: AiProviderConfig): AiProviderConfig | null {
  const next: AiProviderConfig = {};
  if (config.key && config.key.length > 0) next.key = config.key;
  if (config.baseUrl && config.baseUrl.length > 0) next.baseUrl = config.baseUrl;
  if (config.model && config.model.length > 0) next.model = config.model;
  // These only mean something alongside a key: clearing the credential must
  // not leave a refresh token or an account id behind.
  if (next.key) {
    if (config.oauth) next.oauth = true;
    if (config.refreshToken) next.refreshToken = config.refreshToken;
    if (config.expiresAt !== undefined) next.expiresAt = config.expiresAt;
    if (config.accountId) next.accountId = config.accountId;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function writeConfig(
  configs: Record<string, AiProviderConfig>,
  provider: AiProvider,
  config: AiProviderConfig
): Record<string, AiProviderConfig> {
  const next = { ...configs };
  const compacted = compact(config);
  if (compacted) {
    next[provider] = compacted;
  } else {
    delete next[provider];
  }
  return next;
}

/**
 * The settings changes for moving to another provider: bank what's on screen
 * for the current one, then restore whatever the next one was left with.
 *
 * The memory model is cleared rather than restored — it is one setting shared
 * across providers, and a model id from the old provider can only 404 against
 * the new one.
 */
export function planProviderSwitch(
  settings: ProviderCredentials,
  next: AiProvider
): Partial<AppSettings> {
  if (next === settings.aiProvider) return {};

  const banked = writeConfig(settings.aiProviderConfigs, settings.aiProvider, {
    ...providerConfig(settings, settings.aiProvider),
    key: settings.aiApiKey.trim(),
    model: settings.aiModel.trim(),
    baseUrl: settings.aiBaseUrl.trim()
  });

  const restored = banked[next] ?? {};

  return {
    aiProvider: next,
    aiProviderConfigs: banked,
    aiApiKey: restored.key ?? "",
    aiModel: restored.model ?? "",
    aiBaseUrl: restored.baseUrl ?? "",
    assistantMemoryModel: ""
  };
}

/**
 * The settings changes for a new credential on the *current* provider, whether
 * pasted or issued by a sign-in. Writing both places at once keeps the live key
 * and the vault from drifting apart.
 */
export function planCredentialChange(
  settings: ProviderCredentials,
  key: string,
  options: {
    oauth?: boolean;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;
  } = {}
): Partial<AppSettings> {
  const trimmed = key.trim();
  const signedIn = trimmed.length > 0 && options.oauth === true;
  return {
    aiApiKey: key,
    aiProviderConfigs: writeConfig(settings.aiProviderConfigs, settings.aiProvider, {
      // A pasted key replaces a sign-in outright: keeping the old refresh
      // token would silently re-mint over what the user just typed.
      ...(signedIn ? providerConfig(settings, settings.aiProvider) : {}),
      key: trimmed,
      oauth: signedIn,
      ...(signedIn
        ? {
            ...(options.refreshToken ? { refreshToken: options.refreshToken } : {}),
            ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
            ...(options.accountId ? { accountId: options.accountId } : {})
          }
        : { refreshToken: undefined, expiresAt: undefined, accountId: undefined })
    })
  };
}

/**
 * The settings changes for a re-minted access token.
 *
 * Targets `provider` explicitly rather than whatever is selected now: a refresh
 * started before the user switched providers must still file its new token
 * against the provider it belongs to, and must not overwrite the live key of
 * the one they just moved to.
 */
export function planTokenRefresh(
  settings: ProviderCredentials,
  provider: AiProvider,
  tokens: { key: string; refreshToken?: string; expiresAt?: number; accountId?: string }
): Partial<AppSettings> {
  const previous = providerConfig(settings, provider);
  const configs = writeConfig(settings.aiProviderConfigs, provider, {
    ...previous,
    key: tokens.key,
    oauth: true,
    refreshToken: tokens.refreshToken ?? previous.refreshToken,
    ...(tokens.expiresAt !== undefined ? { expiresAt: tokens.expiresAt } : {}),
    accountId: tokens.accountId ?? previous.accountId
  });

  return {
    aiProviderConfigs: configs,
    ...(provider === settings.aiProvider ? { aiApiKey: tokens.key } : {})
  };
}

/** The settings changes for a model or endpoint the user just picked. */
export function planProviderFieldChange(
  settings: ProviderCredentials,
  field: "aiModel" | "aiBaseUrl",
  value: string
): Partial<AppSettings> {
  const entryField = field === "aiModel" ? "model" : "baseUrl";
  return {
    [field]: value,
    aiProviderConfigs: writeConfig(settings.aiProviderConfigs, settings.aiProvider, {
      ...providerConfig(settings, settings.aiProvider),
      [entryField]: value.trim()
    })
  };
}
