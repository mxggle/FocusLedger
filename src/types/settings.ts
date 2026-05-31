export type AppTheme = "system" | "light" | "dark";

export type AppSettings = {
  defaultCategoryId: string;
  dailyFocusTargetMinutes: number;
  startWeekOnMonday: boolean;
  theme: AppTheme;
  enableTray: boolean;
  enableNotifications: boolean;
  globalShortcut: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCategoryId: "inbox",
  dailyFocusTargetMinutes: 240,
  startWeekOnMonday: true,
  theme: "system",
  enableTray: true,
  enableNotifications: true,
  globalShortcut: "CmdOrCtrl+Shift+Space"
};
