import type { PermissionLevel } from "../services/ai/assistant/agentTools/types";

export type AppTheme = "system" | "light" | "dark";

/**
 * Provider ids are persisted in settings, so this list is append-only:
 * renaming an entry silently drops a user's configuration. Everything each id
 * means (endpoint, wire protocol, auth, models) lives in
 * `src/services/ai/providerCatalog.ts`.
 */
export type AiProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai"
  | "deepseek"
  | "mistral"
  | "moonshot"
  | "zhipu"
  | "qwen"
  | "openrouter"
  | "chatgpt"
  | "groq"
  | "together"
  | "ollama"
  | "lmstudio"
  | "custom";

/** How task reminders reach the user when they need attention. */
export type NotificationStyle = "system" | "fullscreen";

/**
 * What happens after a focus session is marked done.
 * - `off`: nothing (the original behavior).
 * - `ask`: offer a break via a non-blocking toast.
 * - `auto`: drop straight into the rest screen.
 */
export type RestAfterTask = "off" | "ask" | "auto";

export type AppSettings = {
  defaultCategoryId: string;
  dailyFocusTargetMinutes: number;
  startWeekOnMonday: boolean;
  theme: AppTheme;
  enableTray: boolean;
  enableNotifications: boolean;
  /** Which presentation style reminders use: system banner or full screen. */
  notificationStyle: NotificationStyle;
  globalShortcut: string;
  /** `YYYY-MM-DD`; empty until the user sets it. Powers the Life page. */
  birthDate: string;
  /** Life-expectancy horizon (years) for the "life in weeks" grid. */
  lifeExpectancyYears: number;
  /** Which AI provider powers debriefs and other AI features. */
  aiProvider: AiProvider;
  /**
   * The credential for the *currently selected* provider. Kept as its own
   * setting because every AI code path reads it; `aiProviderKeys` is the vault
   * it is swapped in and out of when the provider changes.
   */
  aiApiKey: string;
  /**
   * What was configured for each provider, keyed by provider id. Switching
   * providers swaps an entry in and out of `aiApiKey` / `aiModel` / `aiBaseUrl`
   * instead of throwing away what you set up for the last one.
   */
  aiProviderConfigs: Record<string, AiProviderConfig>;
  /** Model ID override; empty uses the provider's default model. */
  aiModel: string;
  /**
   * Endpoint override for providers that allow one (custom, Ollama, LM Studio,
   * Qwen's regional hosts). Empty uses the provider's shipped base URL.
   */
  aiBaseUrl: string;
  /** Language for AI output (English name, e.g. "Japanese"); empty lets the model decide. */
  aiLanguage: string;
  /** Free-text "About me" the assistant reads every turn (role, projects, hours, goals). */
  assistantProfile: string;
  /** The assistant's display name (its "soul" answers to this). */
  assistantName: string;
  /** Markdown SOUL.md-style identity block. Blank → the shipped DEFAULT_SOUL is used. */
  assistantSoul: string;
  /** How freely the assistant may apply write tools. */
  assistantPermissionLevel: PermissionLevel;
  /** Master switch for self-curated memory (background review + recall). */
  assistantMemoryEnabled: boolean;
  /** Optional cheaper model for the background memory review; empty → reuse aiModel. */
  assistantMemoryModel: string;
  /** Generate the daily debrief automatically at `debriefAutoTime`. */
  debriefAutoEnabled: boolean;
  /** Local time of day (`HH:mm`) for the automatic debrief. */
  debriefAutoTime: string;
  /**
   * Ambient focus atmosphere. Visual scene and sound layers are independent
   * axes; both default to off so the focus surfaces are unchanged out of the box.
   */
  /** Active procedural scene id (a `SCENES` entry) or `"none"`. */
  ambientScene: string;
  /** Focus clock face (a `CLOCKS` entry id); unknown values fall back to the ring. */
  focusClockStyle: string;
  /**
   * Per-sound layer prefs keyed by `SoundDef.id`. Default-merged against the
   * live `SOUNDS` manifest on use, so adding/removing a sound never corrupts
   * stored prefs (see `normalizeAmbientSounds`).
   */
  ambientSounds: Record<string, AmbientSoundPref>;
  /** Master output volume applied across all layers, 0..1. */
  ambientMasterVolume: number;
  /** Master mute toggle, independent of master volume. */
  ambientMuted: boolean;
  /**
   * Rest / break mode. Rest is never tracked as a task; these only control when
   * and how the rest screen appears.
   */
  /** Master switch for the rest feature (entry points + auto-rest). */
  restEnabled: boolean;
  /** Default rest length in minutes for manual and offered breaks. */
  restDefaultMinutes: number;
  /** What to do once a focus session ends with "done". */
  restAfterTask: RestAfterTask;
  /**
   * Only offer / start an after-task break when the finished session ran at
   * least this long, so wrapping up a two-minute errand never nags you to rest.
   */
  restAfterTaskMinSessionMinutes: number;
};

/**
 * Remembered configuration for one provider. Every field is optional: an entry
 * only records what the user actually set.
 */
export type AiProviderConfig = {
  /** API key or OAuth-issued credential. */
  key?: string;
  /** Endpoint override, for providers that allow one. */
  baseUrl?: string;
  /** Last model picked for this provider. */
  model?: string;
  /**
   * The key was issued by signing in rather than pasted. Only changes how the
   * credential is presented (and that "Disconnect" is offered) — it is sent
   * exactly like a pasted key.
   */
  oauth?: boolean;
  /**
   * Refresh token, for sign-ins that return an expiring access token rather
   * than a durable key. `key` then holds the access token.
   */
  refreshToken?: string;
  /** Epoch milliseconds at which `key` stops being accepted. */
  expiresAt?: number;
  /** Account the credential belongs to, when the API wants it named. */
  accountId?: string;
};

/** Stored preference for a single ambient sound layer. */
export type AmbientSoundPref = {
  enabled: boolean;
  /** Per-layer volume, 0..1. */
  volume: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCategoryId: "inbox",
  dailyFocusTargetMinutes: 240,
  startWeekOnMonday: true,
  theme: "system",
  enableTray: true,
  enableNotifications: true,
  notificationStyle: "system",
  globalShortcut: "CommandOrControl+Shift+Space",
  birthDate: "",
  lifeExpectancyYears: 80,
  aiProvider: "anthropic",
  aiApiKey: "",
  aiProviderConfigs: {},
  aiModel: "",
  aiBaseUrl: "",
  aiLanguage: "",
  assistantProfile: "",
  assistantName: "Yolo Assistant",
  assistantSoul: "",
  assistantPermissionLevel: "auto",
  assistantMemoryEnabled: true,
  assistantMemoryModel: "",
  debriefAutoEnabled: false,
  debriefAutoTime: "23:00",
  ambientScene: "none",
  focusClockStyle: "ring",
  ambientSounds: {},
  ambientMasterVolume: 0.6,
  ambientMuted: false,
  restEnabled: true,
  restDefaultMinutes: 5,
  restAfterTask: "ask",
  restAfterTaskMinSessionMinutes: 15
};
