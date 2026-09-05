import { invoke } from "@tauri-apps/api/core";
import type { AiProvider } from "../../types";
import { openExternal } from "../../utils/openExternal";
import {
  oauthConfig,
  providerDef,
  redirectUri as buildRedirectUri,
  type OAuthConfig,
  type OAuthTokenConfig
} from "./providerCatalog";

/**
 * Browser sign-in for providers that offer it, as an alternative to hunting
 * down an API key in a dashboard.
 *
 * The flow is OAuth 2.0 with PKCE (RFC 7636) and a loopback redirect (RFC 8252
 * — the current guidance for native apps):
 *
 * 1. Generate a random `verifier` and send only its SHA-256 `challenge` to the
 *    provider. The verifier never leaves this process, so a code intercepted on
 *    the way back is not redeemable by anyone else.
 * 2. Open the provider's page in the *system browser*, so the user types their
 *    password into the provider's own site — never into Yolo.
 * 3. Take the code on `http://localhost:<port>/callback`, checking the `state`
 *    we sent to reject a callback we didn't start. The listener binds
 *    `127.0.0.1` while the URL says `localhost`, which is what providers
 *    register; browsers fall back to the IPv4 address when `::1` refuses.
 * 4. Trade code + verifier for a credential.
 *
 * The `exchange` discriminant says what comes back:
 *
 * - `apiKey` (OpenRouter): an ordinary API key. Nothing expires, and it is
 *   stored and sent exactly like a pasted one.
 * - `tokens` (ChatGPT/Codex): a short-lived access token plus a refresh token.
 *   `refreshTokens` re-mints the access token before it expires, so signing in
 *   once keeps working.
 */

/** How long the user gets to finish signing in before we stop listening. */
const SIGN_IN_TIMEOUT_SECONDS = 300;

type OauthCallback = {
  code: string | null;
  state: string | null;
  error: string | null;
};

export type OAuthResult = {
  /** The credential to send. An access token for `tokens` providers. */
  apiKey: string;
  /** Present for `tokens` providers: what re-mints `apiKey` when it expires. */
  refreshToken?: string;
  /** Epoch milliseconds at which `apiKey` stops being accepted. */
  expiresAt?: number;
  /** The account the credential belongs to, when the provider names one. */
  accountId?: string;
};

/**
 * Re-mint an access token slightly before it actually expires, so a request
 * doesn't race the clock or a slow network.
 */
const EXPIRY_MARGIN_MS = 60_000;

/** True when a stored token is missing, expired, or about to be. */
export function needsRefresh(expiresAt: number | undefined, now = Date.now()): boolean {
  if (expiresAt === undefined) return false;
  return now >= expiresAt - EXPIRY_MARGIN_MS;
}

/**
 * Runs the whole sign-in and resolves with the credential to store. Rejects
 * with a message meant for a toast — a cancelled flow, a timeout and a refused
 * exchange all read as sentences, not status codes.
 */
export async function signInWithProvider(provider: AiProvider): Promise<OAuthResult> {
  const config = oauthConfig(provider);
  if (!config) {
    throw new Error(`${providerDef(provider).label} does not offer sign-in — paste an API key`);
  }

  const { verifier, challenge } = await createPkcePair();
  const state = randomToken(16);
  // Providers that registered a single redirect URI need that exact port;
  // the rest get whichever one the OS has free.
  const port = await invoke<number>("oauth_start", { port: config.redirectPort ?? null });
  const redirectUri = buildRedirectUri(config, port);

  try {
    await openExternal(authorizeUrl(config, { challenge, state, redirectUri }));

    const callback = await invoke<OauthCallback>("oauth_wait", {
      port,
      timeoutSecs: SIGN_IN_TIMEOUT_SECONDS
    });

    if (callback.error) throw new Error(`Sign-in was refused: ${callback.error}`);
    if (!callback.code) throw new Error("Sign-in finished without an authorization code");
    // A provider that echoes `state` must echo ours; one that drops the
    // parameter entirely (OpenRouter appends only `code`) can't be checked, and
    // PKCE plus the loopback-only socket carry that case.
    if (callback.state !== null && callback.state !== state) {
      throw new Error("Sign-in response did not match the request — start again");
    }

    return await exchangeCode(config, { code: callback.code, verifier, redirectUri });
  } finally {
    // Finished or failed, stop listening. Cancelling an already-consumed
    // listener is a no-op.
    await invoke("oauth_cancel", { port }).catch(() => undefined);
  }
}

function authorizeUrl(
  config: OAuthConfig,
  params: { challenge: string; state: string; redirectUri: string }
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);

  if (config.exchange === "tokens") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", config.scope);
    for (const [key, value] of Object.entries(config.authorizeParams ?? {})) {
      url.searchParams.set(key, value);
    }
  } else {
    // OpenRouter names the redirect differently and infers the rest.
    url.searchParams.set("callback_url", params.redirectUri);
  }

  return url.toString();
}

async function exchangeCode(
  config: OAuthConfig,
  params: { code: string; verifier: string; redirectUri: string }
): Promise<OAuthResult> {
  if (config.exchange === "tokens") {
    return postForTokens(config, {
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: config.clientId,
      code_verifier: params.verifier
    });
  }

  const payload = await postJson(config.exchangeUrl, {
    code: params.code,
    code_verifier: params.verifier,
    code_challenge_method: "S256"
  });

  const key = readKey(payload);
  if (!key) throw new Error("Sign-in succeeded but no key came back — try again");
  return { apiKey: key };
}

/**
 * Trades a refresh token for a fresh access token. Providers may or may not
 * rotate the refresh token; the old one is kept when no new one comes back.
 */
export async function refreshTokens(
  config: OAuthTokenConfig,
  refreshToken: string
): Promise<OAuthResult> {
  const result = await postForTokens(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    scope: config.scope
  });
  return { ...result, refreshToken: result.refreshToken ?? refreshToken };
}

/** The OAuth token endpoint: form-encoded in, JSON out (RFC 6749). */
async function postForTokens(
  config: OAuthTokenConfig,
  form: Record<string, string>
): Promise<OAuthResult> {
  const { fetch } = await import("@tauri-apps/plugin-http");

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString()
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; the status below carries the useful error.
  }

  if (!response.ok) {
    throw new Error(readMessage(payload) ?? `Sign-in failed (HTTP ${response.status})`);
  }

  const tokens = payload as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    id_token?: unknown;
  } | null;

  const accessToken = typeof tokens?.access_token === "string" ? tokens.access_token : "";
  if (accessToken.length === 0) {
    throw new Error("Sign-in succeeded but no access token came back — try again");
  }

  const accountId =
    typeof tokens?.id_token === "string" ? readAccountId(tokens.id_token) : undefined;

  return {
    apiKey: accessToken,
    ...(typeof tokens?.refresh_token === "string"
      ? { refreshToken: tokens.refresh_token }
      : {}),
    ...(typeof tokens?.expires_in === "number"
      ? { expiresAt: Date.now() + tokens.expires_in * 1000 }
      : {}),
    ...(accountId ? { accountId } : {})
  };
}

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
  // The exchange goes through the Tauri HTTP plugin for the same reason every
  // other provider call does: no browser origin, so no CORS refusal.
  const { fetch } = await import("@tauri-apps/plugin-http");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; the status below carries the useful error.
  }

  if (!response.ok) {
    throw new Error(
      readMessage(payload) ?? `Could not finish sign-in (HTTP ${response.status})`
    );
  }
  return payload;
}

/**
 * Digs the account id out of the id token's claims. The JWT is *not* verified
 * here: it came from the token endpoint over TLS, and it is used only to label
 * requests, never to grant anything. Anything unexpected reads as "unknown"
 * rather than throwing — the account header is optional.
 */
export function readAccountId(idToken: string): string | undefined {
  const payload = idToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as Record<string, unknown>;
    const auth = claims["https://api.openai.com/auth"];
    if (typeof auth === "object" && auth !== null) {
      const account = (auth as { chatgpt_account_id?: unknown }).chatgpt_account_id;
      if (typeof account === "string" && account.length > 0) return account;
    }
  } catch {
    // A claim set we can't read just means no account header.
  }
  return undefined;
}

function readKey(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const key = (payload as { key?: unknown }).key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function readMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const description = (payload as { error_description?: unknown }).error_description;
  if (typeof description === "string") return description;
  const error = (payload as { error?: unknown; message?: unknown }).error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

/**
 * A PKCE verifier and its S256 challenge. The verifier is 43 base64url
 * characters — the shortest length RFC 7636 allows, from 32 bytes of CSPRNG
 * output.
 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** `bytes` bytes of CSPRNG output as a base64url string (no padding). */
export function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
