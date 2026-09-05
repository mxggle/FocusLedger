import { ExternalLink, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  isOauthKey,
  planCredentialChange,
  planProviderFieldChange,
  planProviderSwitch
} from "../../services/ai/credentials";
import { signInWithProvider } from "../../services/ai/oauth";
import {
  PROVIDER_GROUP_LABELS,
  PROVIDER_GROUP_ORDER,
  providerDef,
  providersInGroup
} from "../../services/ai/providerCatalog";
import type { ProviderDef } from "../../services/ai/providerCatalog";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import type { AiProvider } from "../../types";
import { openExternal } from "../../utils/openExternal";
import { Field, Input, Select } from "../ui/Field";

/**
 * A labelled row whose content isn't a form control. `Field` renders a
 * `<label>`, which would wrap these buttons in a control they don't belong to.
 */
function Block({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </div>
  );
}

/**
 * A provider's entry in the dropdown. Sign-in support is called out here
 * because it is otherwise invisible until you have already picked the provider.
 */
function optionLabel(provider: ProviderDef): string {
  if (provider.auth === "oauth") return `${provider.label} — sign in`;
  if (provider.auth === "oauthOrKey") return `${provider.label} — sign in or key`;
  return provider.label;
}

/** The primary way in for a provider that offers a browser sign-in. */
function SignInButton({
  label,
  busy,
  onClick
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs outline-none transition-opacity duration-fast hover:opacity-90 focus-visible:shadow-ring disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogIn className="h-4 w-4" aria-hidden="true" />
      )}
      {busy ? "Waiting for your browser…" : label}
    </button>
  );
}

/**
 * Choosing who answers the assistant, and proving you're allowed to ask them.
 *
 * Providers come from the catalog rather than a hand-written list, so the only
 * thing this file decides is presentation: which of the three credential shapes
 * a provider needs — a pasted key, a browser sign-in, or nothing at all for a
 * model running on your own machine.
 */
export function AiProviderFields() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const addToast = useUiStore((state) => state.addToast);
  const [showApiKey, setShowApiKey] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const def = providerDef(settings.aiProvider);
  const connected = isOauthKey(settings);
  const apiKeyUrl = def.apiKeyUrl;

  async function changeProvider(next: AiProvider) {
    setShowApiKey(false);
    await updateSettings(planProviderSwitch(settings, next));
  }

  async function signIn() {
    if (!def.oauth) return;
    setSigningIn(true);
    try {
      const result = await signInWithProvider(settings.aiProvider);
      await updateSettings(
        planCredentialChange(settings, result.apiKey, {
          oauth: true,
          ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
          ...(result.expiresAt !== undefined ? { expiresAt: result.expiresAt } : {}),
          ...(result.accountId ? { accountId: result.accountId } : {})
        })
      );
      addToast({ kind: "success", title: `Signed in to ${def.label}` });
    } catch (error) {
      addToast({
        kind: "error",
        title: "Sign-in failed",
        description: error instanceof Error ? error.message : "Unknown sign-in error"
      });
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <>
      <Field label="Provider">
        <Select
          value={settings.aiProvider}
          onChange={(event) => void changeProvider(event.target.value as AiProvider)}
        >
          {PROVIDER_GROUP_ORDER.map((group) => (
            <optgroup key={group} label={PROVIDER_GROUP_LABELS[group]}>
              {providersInGroup(group).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {optionLabel(provider)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {connected ? (
        <Block
          label="Account"
          hint={def.note ?? `Yolo sends a key ${def.label} issued to your account.`}
        >
          {/* `min-w-0`: as a grid item this row is floored at its min-content
              width, which the nowrap account name blows past — it overflows the
              column instead of letting the name below truncate. */}
          <div className="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm shadow-xs">
            <span className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">Signed in to {def.label}</span>
            </span>
            <button
              type="button"
              onClick={() => void updateSettings(planCredentialChange(settings, ""))}
              className="shrink-0 text-xs font-medium text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
            >
              Disconnect
            </button>
          </div>
        </Block>
      ) : def.auth === "oauth" ? (
        <Block label="Account" hint={def.note}>
          <SignInButton
            label={def.oauth?.buttonLabel ?? "Sign in"}
            busy={signingIn}
            onClick={() => void signIn()}
          />
        </Block>
      ) : def.auth === "none" ? (
        <Block
          label="API key"
          hint={`${def.label} runs on your own machine, so there's no key to add.`}
        >
          <div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-subtle">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Not needed
          </div>
        </Block>
      ) : (
        <div className="grid content-start gap-1.5">
          {def.oauth ? (
            <div className="grid gap-1.5 pb-1">
              <SignInButton
                label={def.oauth.buttonLabel}
                busy={signingIn}
                onClick={() => void signIn()}
              />
              <span className="text-xs text-subtle">or paste an API key below</span>
            </div>
          ) : null}
          <Field label="API key">
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                placeholder="Paste your API key"
                value={settings.aiApiKey}
                onChange={(event) =>
                  void updateSettings(planCredentialChange(settings, event.target.value))
                }
                className="pr-9"
              />
              <button
                type="button"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                title={showApiKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowApiKey((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          {/* Outside the <label>, so clicking a link doesn't focus the key field. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {apiKeyUrl ? (
              <button
                type="button"
                onClick={() => void openExternal(apiKeyUrl)}
                className="flex items-center gap-1 text-xs text-subtle outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
              >
                Get a key
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {def.baseUrlEditable ? (
        <Field
          label="Base URL"
          hint={
            def.baseUrl.length > 0
              ? `Leave blank to use ${def.baseUrl}`
              : "OpenAI-compatible endpoint, e.g. http://localhost:11434/v1"
          }
        >
          <Input
            type="text"
            placeholder={def.baseUrl.length > 0 ? def.baseUrl : "https://your-endpoint/v1"}
            value={settings.aiBaseUrl}
            onChange={(event) =>
              void updateSettings(
                planProviderFieldChange(settings, "aiBaseUrl", event.target.value)
              )
            }
          />
        </Field>
      ) : null}
    </>
  );
}
