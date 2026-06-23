import type { PermissionLevel } from "../services/ai/assistant/agentTools/types";

export type AppTheme = "system" | "light" | "dark";

export type AiProvider = "anthropic" | "openai" | "gemini" | "custom";

/** How task reminders reach the user when they need attention. */
export type NotificationStyle = "system" | "fullscreen";

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
  debriefAutoTime: "23:00"
};
