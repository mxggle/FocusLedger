import type { PermissionLevel } from "../services/ai/assistant/agentTools/types";

export type AppTheme = "system" | "light" | "dark";

export type AiProvider = "anthropic" | "openai" | "gemini" | "custom";

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
  /** User-supplied API key for the selected provider (BYO key). */
  aiApiKey: string;
  /** Model ID override; empty uses the provider's default model. */
  aiModel: string;
  /** Base URL for OpenAI-compatible custom providers (e.g. http://localhost:11434/v1). */
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
