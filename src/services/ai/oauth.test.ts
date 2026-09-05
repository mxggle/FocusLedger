import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, openExternal, fetch } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openExternal: vi.fn(),
  fetch: vi.fn()
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch }));
vi.mock("../../utils/openExternal", () => ({ openExternal }));

import {
  createPkcePair,
  needsRefresh,
  randomToken,
  readAccountId,
  refreshTokens,
  signInWithProvider
} from "./oauth";
import { oauthConfig, type OAuthTokenConfig } from "./providerCatalog";

const PORT = 51234;

/** Wires up the happy path: a port, a callback, and an issued key. */
function mockFlow(callback: Record<string, unknown> = {}) {
  invoke.mockImplementation(async (command: string) => {
    if (command === "oauth_start") return PORT;
    if (command === "oauth_wait") {
      return { code: "auth-code", state: lastState(), error: null, ...callback };
    }
    return undefined;
  });
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ key: "sk-or-issued" }), { status: 200 })
  );
}

/** The `state` the flow put in the URL it asked the browser to open. */
function lastState(): string | null {
  const url = openExternal.mock.calls.at(-1)?.[0];
  return url ? new URL(url).searchParams.get("state") : null;
}

describe("signInWithProvider", () => {
  beforeEach(() => {
    invoke.mockReset();
    openExternal.mockReset();
    fetch.mockReset();
  });

  it("sends the browser to the provider with a challenge, never the verifier", async () => {
    mockFlow();
    await signInWithProvider("openrouter");

    const url = new URL(openExternal.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe(`http://localhost:${PORT}/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();

    // The verifier is the secret that makes the code useless to anyone who
    // intercepts it — it must never appear in a URL handed to the browser.
    const verifier = JSON.parse(fetch.mock.calls[0][1].body as string).code_verifier;
    expect(url.toString()).not.toContain(verifier);
  });

  it("trades the code and verifier for a key", async () => {
    mockFlow();
    const result = await signInWithProvider("openrouter");

    const [exchangeUrl, init] = fetch.mock.calls[0];
    expect(exchangeUrl).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(JSON.parse(init.body as string)).toMatchObject({
      code: "auth-code",
      code_challenge_method: "S256"
    });
    expect(result.apiKey).toBe("sk-or-issued");
  });

  it("rejects a callback whose state is not the one we sent", async () => {
    mockFlow({ state: "someone-elses-state" });
    await expect(signInWithProvider("openrouter")).rejects.toThrow(/did not match/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a callback from a provider that echoes no state", async () => {
    mockFlow({ state: null });
    await expect(signInWithProvider("openrouter")).resolves.toEqual({
      apiKey: "sk-or-issued"
    });
  });

  it("surfaces a refusal from the provider", async () => {
    mockFlow({ code: null, error: "access_denied" });
    await expect(signInWithProvider("openrouter")).rejects.toThrow(/access_denied/);
  });

  it("reports an exchange the provider turned down", async () => {
    mockFlow();
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "code expired" } }), { status: 400 })
    );
    await expect(signInWithProvider("openrouter")).rejects.toThrow("code expired");
  });

  it("stops listening whether the flow succeeds or fails", async () => {
    mockFlow();
    await signInWithProvider("openrouter");
    expect(invoke).toHaveBeenCalledWith("oauth_cancel", { port: PORT });

    invoke.mockReset();
    mockFlow({ code: null, error: "access_denied" });
    await signInWithProvider("openrouter").catch(() => undefined);
    expect(invoke).toHaveBeenCalledWith("oauth_cancel", { port: PORT });
  });

  it("refuses a provider with no sign-in flow before opening anything", async () => {
    await expect(signInWithProvider("openai")).rejects.toThrow(/does not offer sign-in/);
    expect(invoke).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("signing in to a tokens provider (ChatGPT/Codex)", () => {
  beforeEach(() => {
    invoke.mockReset();
    openExternal.mockReset();
    fetch.mockReset();
  });

  /** An id_token whose claims name the ChatGPT account. */
  function idToken(accountId: string): string {
    const claims = { "https://api.openai.com/auth": { chatgpt_account_id: accountId } };
    const body = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_");
    return `header.${body}.signature`;
  }

  function mockTokenFlow(tokens: Record<string, unknown> = {}) {
    invoke.mockImplementation(async (command: string) => {
      if (command === "oauth_start") return 1455;
      if (command === "oauth_wait") return { code: "auth-code", state: lastState(), error: null };
      return undefined;
    });
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          id_token: idToken("acct-42"),
          ...tokens
        }),
        { status: 200 }
      )
    );
  }

  it("asks for the fixed redirect port the provider registered", async () => {
    mockTokenFlow();
    await signInWithProvider("chatgpt");
    expect(invoke).toHaveBeenCalledWith("oauth_start", { port: 1455 });

    const url = new URL(openExternal.mock.calls[0][0] as string);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("posts the code exchange form-encoded, as the OAuth spec requires", async () => {
    mockTokenFlow();
    await signInWithProvider("chatgpt");

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://auth.openai.com/oauth/token");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body as string);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBeTruthy();
  });

  it("keeps the refresh token, expiry and account from the response", async () => {
    mockTokenFlow();
    const before = Date.now();
    const result = await signInWithProvider("chatgpt");

    expect(result.apiKey).toBe("access-1");
    expect(result.refreshToken).toBe("refresh-1");
    expect(result.accountId).toBe("acct-42");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it("fails clearly when no access token comes back", async () => {
    mockTokenFlow({ access_token: undefined });
    await expect(signInWithProvider("chatgpt")).rejects.toThrow(/no access token/);
  });

  it("reports the provider's own description of a refusal", async () => {
    mockTokenFlow();
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "code already used" }),
        { status: 400 }
      )
    );
    await expect(signInWithProvider("chatgpt")).rejects.toThrow("code already used");
  });
});

describe("refreshTokens", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  const config = oauthConfig("chatgpt") as OAuthTokenConfig;

  it("exchanges the refresh token for a new access token", async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "access-2", expires_in: 3600 }),
        { status: 200 }
      )
    );
    const result = await refreshTokens(config, "refresh-1");

    const form = new URLSearchParams(fetch.mock.calls[0][1].body as string);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh-1");
    expect(result.apiKey).toBe("access-2");
    // The provider returned no new refresh token, so the old one stays valid.
    expect(result.refreshToken).toBe("refresh-1");
  });

  it("takes a rotated refresh token when the provider sends one", async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "access-2", refresh_token: "refresh-2" }),
        { status: 200 }
      )
    );
    expect((await refreshTokens(config, "refresh-1")).refreshToken).toBe("refresh-2");
  });
});

describe("needsRefresh", () => {
  it("re-mints a token shortly before it actually expires", () => {
    const now = 1_000_000;
    expect(needsRefresh(now + 5 * 60_000, now)).toBe(false);
    expect(needsRefresh(now + 30_000, now)).toBe(true);
    expect(needsRefresh(now - 1, now)).toBe(true);
  });

  it("leaves a credential with no expiry alone", () => {
    expect(needsRefresh(undefined)).toBe(false);
  });
});

describe("readAccountId", () => {
  it("returns nothing for a token it cannot read", () => {
    expect(readAccountId("not-a-jwt")).toBeUndefined();
    expect(readAccountId("a.!!!.c")).toBeUndefined();
    expect(readAccountId(`a.${btoa(JSON.stringify({ sub: "x" }))}.c`)).toBeUndefined();
  });
});

describe("PKCE parameters", () => {
  it("derives a base64url S256 challenge from the verifier", async () => {
    const { verifier, challenge } = await createPkcePair();
    // RFC 7636 allows 43-128 characters; 32 random bytes gives the minimum.
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(challenge).not.toBe(verifier);

    const { challenge: again } = await createPkcePair();
    expect(again).not.toBe(challenge);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken(16)));
    expect(tokens.size).toBe(50);
  });
});
