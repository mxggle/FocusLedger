import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "./providers";

const { refreshTokens, storeState, updateSettings } = vi.hoisted(() => ({
  refreshTokens: vi.fn(),
  updateSettings: vi.fn(),
  storeState: { settings: {} as Record<string, unknown> }
}));

vi.mock("./oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oauth")>()),
  refreshTokens
}));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ settings: storeState.settings, updateSettings })
  }
}));

import { withFreshCredential } from "./authSession";

const HOUR = 60 * 60 * 1000;

function signedIn(overrides: Record<string, unknown> = {}): AiSettings {
  const settings = {
    aiProvider: "chatgpt" as const,
    aiApiKey: "access-old",
    aiModel: "",
    aiBaseUrl: "",
    aiProviderConfigs: {
      chatgpt: {
        key: "access-old",
        oauth: true,
        refreshToken: "refresh-1",
        accountId: "acct-42",
        expiresAt: Date.now() + HOUR
      }
    },
    ...overrides
  };
  storeState.settings = settings;
  return settings;
}

describe("withFreshCredential", () => {
  beforeEach(() => {
    refreshTokens.mockReset();
    updateSettings.mockReset();
    refreshTokens.mockResolvedValue({
      apiKey: "access-new",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + HOUR
    });
  });

  it("leaves a pasted API key alone — nothing about it expires", async () => {
    const settings: AiSettings = {
      aiProvider: "anthropic",
      aiApiKey: "sk-ant",
      aiModel: "",
      aiBaseUrl: ""
    };
    storeState.settings = settings;

    expect(await withFreshCredential(settings)).toBe(settings);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("leaves a token that is still good alone", async () => {
    const settings = signedIn();
    expect(await withFreshCredential(settings)).toBe(settings);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("re-mints a token that is about to expire, and hands back the new one", async () => {
    const settings = signedIn({
      aiProviderConfigs: {
        chatgpt: {
          key: "access-old",
          oauth: true,
          refreshToken: "refresh-1",
          accountId: "acct-42",
          expiresAt: Date.now() + 10_000
        }
      }
    });

    const fresh = await withFreshCredential(settings);

    expect(refreshTokens).toHaveBeenCalledWith(expect.anything(), "refresh-1");
    expect(fresh.aiApiKey).toBe("access-new");
    // The caller's request must carry the new token, not the stored-but-stale one.
    expect(fresh.aiProviderConfigs?.chatgpt?.key).toBe("access-new");
    expect(fresh.aiProviderConfigs?.chatgpt?.refreshToken).toBe("refresh-2");
    // A refresh that doesn't restate the account keeps the one we had.
    expect(fresh.aiProviderConfigs?.chatgpt?.accountId).toBe("acct-42");
  });

  it("persists the new token so the next launch doesn't sign in again", async () => {
    signedIn({
      aiProviderConfigs: {
        chatgpt: { key: "access-old", oauth: true, refreshToken: "refresh-1", expiresAt: 0 }
      }
    });
    await withFreshCredential(storeState.settings as AiSettings);

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings.mock.calls[0][0]).toMatchObject({ aiApiKey: "access-new" });
  });

  it("refreshes once when several calls race the same expiry", async () => {
    const settings = signedIn({
      aiProviderConfigs: {
        chatgpt: { key: "access-old", oauth: true, refreshToken: "refresh-1", expiresAt: 0 }
      }
    });

    const [a, b, c] = await Promise.all([
      withFreshCredential(settings),
      withFreshCredential(settings),
      withFreshCredential(settings)
    ]);

    // A second refresh would invalidate the token the first one just minted.
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect([a.aiApiKey, b.aiApiKey, c.aiApiKey]).toEqual([
      "access-new",
      "access-new",
      "access-new"
    ]);
  });

  it("says what to do when the refresh itself is refused", async () => {
    refreshTokens.mockRejectedValue(new Error("invalid_grant"));
    const settings = signedIn({
      aiProviderConfigs: {
        chatgpt: { key: "access-old", oauth: true, refreshToken: "refresh-1", expiresAt: 0 }
      }
    });

    await expect(withFreshCredential(settings)).rejects.toThrow(/sign in again/);
  });

  it("does not overwrite the live key when the user switched provider mid-refresh", async () => {
    const settings = signedIn({
      aiProviderConfigs: {
        chatgpt: { key: "access-old", oauth: true, refreshToken: "refresh-1", expiresAt: 0 }
      }
    });
    // The store has moved on to Anthropic while the refresh was in flight.
    storeState.settings = {
      ...settings,
      aiProvider: "anthropic",
      aiApiKey: "sk-ant"
    };

    await withFreshCredential(settings);

    const patch = updateSettings.mock.calls[0][0];
    expect(patch.aiApiKey).toBeUndefined();
    expect(patch.aiProviderConfigs.chatgpt.key).toBe("access-new");
  });
});
