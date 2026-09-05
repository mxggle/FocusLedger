import type { AiProvider } from "../../types";

/**
 * The HTTP dialect a provider speaks. Nearly every vendor ships an
 * OpenAI-compatible `/chat/completions` endpoint, so the request builders,
 * response parsers and stream readers key off this — not off the provider id.
 * Adding a provider is then a data entry in `PROVIDERS`, not a new `case` in
 * five switch statements.
 */
export type AiWireProtocol = "anthropic" | "openai" | "gemini" | "responses";

/** How a provider is authenticated. */
export type AiAuthMode =
  /** A key the user pastes (BYO key). */
  | "apiKey"
  /** A key the user pastes, or one issued by signing in (see `oauth`). */
  | "oauthOrKey"
  /** Sign-in only — there is no key to paste for this endpoint. */
  | "oauth"
  /** Nothing to send — a local runtime on the user's own machine. */
  | "none";

/**
 * An OAuth 2.0 + PKCE sign-in, run in the user's browser and handed back
 * through a loopback redirect; see `oauth.ts`. The two variants differ only in
 * what the exchange gives back.
 */
export type OAuthConfig = OAuthApiKeyConfig | OAuthTokenConfig;

type OAuthConfigBase = {
  /** Where the browser is sent to sign in. */
  authorizeUrl: string;
  /** Button copy, e.g. "Sign in with OpenRouter". */
  buttonLabel: string;
  /**
   * Redirect port, when the provider registered exactly one redirect URI and
   * will accept no other. Omitted lets the OS pick a free port, which avoids
   * colliding with whatever else is on the machine.
   */
  redirectPort?: number;
  /** Redirect path the provider registered; defaults to `/callback`. */
  redirectPath?: string;
};

/**
 * The exchange returns an ordinary API key (`{ key }`). Nothing expires, so it
 * is stored and sent exactly like a pasted key.
 */
export type OAuthApiKeyConfig = OAuthConfigBase & {
  exchange: "apiKey";
  /** POST target that trades the callback code for the key. */
  exchangeUrl: string;
};

/**
 * The exchange returns OAuth tokens: a short-lived access token plus a refresh
 * token. Access tokens are re-minted before they expire (see `refreshTokens`),
 * so signing in once keeps working.
 */
export type OAuthTokenConfig = OAuthConfigBase & {
  exchange: "tokens";
  /** POST target for both the code exchange and later refreshes. */
  tokenUrl: string;
  /** Public client id — no secret, which is why PKCE is mandatory here. */
  clientId: string;
  scope: string;
  /** Provider-specific authorize parameters beyond the OAuth standard ones. */
  authorizeParams?: Record<string, string>;
};

/** How providers are grouped in the picker. */
export type ProviderGroup = "frontier" | "gateway" | "local";

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
  frontier: "Model providers",
  gateway: "Gateways",
  local: "Local & custom"
};

export type ProviderDef = {
  id: AiProvider;
  label: string;
  group: ProviderGroup;
  wire: AiWireProtocol;
  /**
   * API root the request builders join paths onto (no trailing slash). Empty
   * when the user supplies it — see `baseUrlEditable`.
   */
  baseUrl: string;
  /** True when the endpoint is the user's to choose (self-hosted, proxies). */
  baseUrlEditable?: boolean;
  auth: AiAuthMode;
  oauth?: OAuthConfig;
  /** Where the user gets a key, linked under the key field. */
  apiKeyUrl?: string;
  /** Model used when the user hasn't picked one; empty means "must pick". */
  defaultModel: string;
  /** The shortlist we vouch for — see `models.ts`. */
  models: ModelShortlistEntry[];
  /** Provider-specific headers merged into every request. */
  headers?: Record<string, string>;
  /**
   * The endpoint only answers as a stream. One-shot generation is served by
   * reading a stream to its end rather than by a separate request.
   */
  streamOnly?: boolean;
  /** Why this provider needs explaining, shown under the picker. */
  note?: string;
};

export type ModelShortlistEntry = {
  id: string;
  label: string;
  /** Short positioning note ("Balanced", "Fastest") shown next to the label. */
  hint?: string;
};

/** Sent by gateways that attribute traffic to the calling app. */
const APP_URL = "https://github.com/mxggle/yolo";
const APP_NAME = "Yolo";

/**
 * The Codex backend gates its model catalog on the calling client's version and
 * rejects the request outright without one. We speak that endpoint's protocol,
 * so we answer with the Codex CLI release we were built against.
 */
export const CODEX_CLIENT_VERSION = "0.145.0";

/**
 * Every provider Yolo can talk to. Ids are persisted in settings, so they are
 * append-only: renaming one silently drops a user's configuration.
 *
 * Curated model ids are a starting menu, not a contract — the live catalog
 * fetched with the user's key is what the picker ultimately shows, and any
 * shortlist entry the key can't reach is dropped (see `mergeModelOptions`).
 */
export const PROVIDERS: Record<AiProvider, ProviderDef> = {
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    group: "frontier",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    auth: "apiKey",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-opus-5",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", hint: "Most capable" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fastest, cheapest" }
    ]
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://api.openai.com/v1",
    auth: "apiKey",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5.1",
    models: [
      { id: "gpt-5.1", label: "GPT-5.1", hint: "Most capable" },
      { id: "gpt-5.1-mini", label: "GPT-5.1 mini", hint: "Balanced" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Fastest, cheapest" }
    ]
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    group: "frontier",
    wire: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: "apiKey",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Most capable" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", hint: "Fastest, cheapest" }
    ]
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://api.x.ai/v1",
    auth: "apiKey",
    apiKeyUrl: "https://console.x.ai",
    defaultModel: "grok-4",
    models: [
      { id: "grok-4", label: "Grok 4", hint: "Most capable" },
      { id: "grok-4-fast", label: "Grok 4 Fast", hint: "Balanced" },
      { id: "grok-3-mini", label: "Grok 3 mini", hint: "Fastest, cheapest" }
    ]
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    auth: "apiKey",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-chat",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", hint: "Balanced" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", hint: "Thinks before answering" }
    ]
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    auth: "apiKey",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    defaultModel: "mistral-medium-latest",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large", hint: "Most capable" },
      { id: "mistral-medium-latest", label: "Mistral Medium", hint: "Balanced" },
      { id: "mistral-small-latest", label: "Mistral Small", hint: "Fastest, cheapest" }
    ]
  },
  moonshot: {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://api.moonshot.ai/v1",
    auth: "apiKey",
    apiKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    defaultModel: "kimi-latest",
    models: [
      { id: "kimi-k2-turbo-preview", label: "Kimi K2 Turbo", hint: "Most capable" },
      { id: "kimi-latest", label: "Kimi (latest)", hint: "Balanced" }
    ]
  },
  zhipu: {
    id: "zhipu",
    label: "Zhipu (GLM)",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    auth: "apiKey",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    defaultModel: "glm-4.6",
    models: [
      { id: "glm-4.6", label: "GLM-4.6", hint: "Most capable" },
      { id: "glm-4.5-air", label: "GLM-4.5 Air", hint: "Fastest, cheapest" }
    ]
  },
  qwen: {
    id: "qwen",
    label: "Qwen (Alibaba)",
    group: "frontier",
    wire: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    baseUrlEditable: true,
    auth: "apiKey",
    apiKeyUrl: "https://bailian.console.alibabacloud.com",
    defaultModel: "qwen-plus",
    models: [
      { id: "qwen-max", label: "Qwen Max", hint: "Most capable" },
      { id: "qwen-plus", label: "Qwen Plus", hint: "Balanced" },
      { id: "qwen-turbo", label: "Qwen Turbo", hint: "Fastest, cheapest" }
    ]
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    group: "gateway",
    wire: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    auth: "oauthOrKey",
    oauth: {
      // OpenRouter documents this PKCE flow for third-party apps: the browser
      // signs in, and the exchange returns a normal API key scoped to the user.
      authorizeUrl: "https://openrouter.ai/auth",
      exchangeUrl: "https://openrouter.ai/api/v1/auth/keys",
      exchange: "apiKey",
      buttonLabel: "Sign in with OpenRouter"
    },
    apiKeyUrl: "https://openrouter.ai/keys",
    defaultModel: "anthropic/claude-sonnet-5",
    models: [
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced" },
      { id: "openai/gpt-5.1", label: "GPT-5.1", hint: "Most capable" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fastest, cheapest" }
    ],
    headers: { "HTTP-Referer": APP_URL, "X-Title": APP_NAME }
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT (Codex sign-in)",
    group: "gateway",
    // The Codex backend speaks the Responses API, not chat completions.
    wire: "responses",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    // There is no key to paste: this endpoint only accepts a signed-in token.
    auth: "oauth",
    streamOnly: true,
    oauth: {
      exchange: "tokens",
      buttonLabel: "Sign in with ChatGPT",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
      // Codex CLI's public client. OpenAI publishes no third-party client for
      // this endpoint, so signing in here uses your ChatGPT plan the way Codex
      // does — it is subject to your OpenAI terms, and OpenAI can change or
      // revoke it without notice.
      clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
      scope: "openid profile email offline_access",
      // The only redirect URI registered for that client.
      redirectPort: 1455,
      redirectPath: "/auth/callback",
      authorizeParams: {
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true"
      }
    },
    defaultModel: "gpt-5.6-sol",
    // A starting menu only: this endpoint publishes its own catalog (see
    // `buildModelsRequest`), and OpenAI rotates the lineup often enough that
    // the live list is what the picker really shows.
    models: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "Most capable" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", hint: "Balanced" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "Fastest, cheapest" }
    ],
    note: "Uses your ChatGPT plan through the endpoint Codex CLI signs in to, not an API key.",
    headers: {
      // The Codex backend expects the Responses beta and identifies its caller.
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs"
    }
  },
  groq: {
    id: "groq",
    label: "Groq",
    group: "gateway",
    wire: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    auth: "apiKey",
    apiKeyUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", hint: "Most capable" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", hint: "Balanced" },
      { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2 Instruct" }
    ]
  },
  together: {
    id: "together",
    label: "Together AI",
    group: "gateway",
    wire: "openai",
    baseUrl: "https://api.together.xyz/v1",
    auth: "apiKey",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
    defaultModel: "",
    models: []
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    group: "local",
    wire: "openai",
    baseUrl: "http://localhost:11434/v1",
    baseUrlEditable: true,
    // Ollama serves the machine it runs on and takes no key.
    auth: "none",
    defaultModel: "",
    models: []
  },
  lmstudio: {
    id: "lmstudio",
    label: "LM Studio (local)",
    group: "local",
    wire: "openai",
    baseUrl: "http://localhost:1234/v1",
    baseUrlEditable: true,
    auth: "none",
    defaultModel: "",
    models: []
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    group: "local",
    wire: "openai",
    baseUrl: "",
    baseUrlEditable: true,
    auth: "apiKey",
    defaultModel: "",
    models: []
  }
};

/** Picker order: groups in a fixed order, providers in declaration order. */
export const PROVIDER_GROUP_ORDER: ProviderGroup[] = ["frontier", "gateway", "local"];

export function providersInGroup(group: ProviderGroup): ProviderDef[] {
  return Object.values(PROVIDERS).filter((provider) => provider.group === group);
}

export function providerDef(provider: AiProvider): ProviderDef {
  return PROVIDERS[provider];
}

/** True when requests need a credential the user has to supply. */
export function requiresApiKey(provider: AiProvider): boolean {
  return PROVIDERS[provider].auth !== "none";
}

/** The OAuth sign-in a provider offers, if any. */
export function oauthConfig(provider: AiProvider): OAuthConfig | null {
  return PROVIDERS[provider].oauth ?? null;
}

/** True when signing in is the only way to authenticate this provider. */
export function requiresSignIn(provider: AiProvider): boolean {
  return PROVIDERS[provider].auth === "oauth";
}

/** The redirect URI a provider's sign-in comes back to. */
export function redirectUri(config: OAuthConfig, port: number): string {
  return `http://localhost:${port}${config.redirectPath ?? "/callback"}`;
}

/** Strips a trailing slash so URL joining stays predictable. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * The API root to call: the user's override when the provider allows one and
 * they set it, otherwise the shipped default. Throws for providers that have
 * no default and no override, since the alternative is a request to `/…` that
 * can only fail confusingly.
 */
export function resolveBaseUrl(provider: AiProvider, baseUrlOverride: string): string {
  const def = PROVIDERS[provider];
  const override = normalizeBaseUrl(baseUrlOverride);
  if (def.baseUrlEditable && override.length > 0) return override;
  const fallback = normalizeBaseUrl(def.baseUrl);
  if (fallback.length > 0) return fallback;
  throw new Error(`${def.label} needs a base URL (e.g. http://localhost:11434/v1)`);
}
