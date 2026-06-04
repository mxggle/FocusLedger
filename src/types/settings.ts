export type AppTheme = "system" | "light" | "dark";

export type AppSettings = {
  defaultCategoryId: string;
  dailyFocusTargetMinutes: number;
  startWeekOnMonday: boolean;
  theme: AppTheme;
  enableTray: boolean;
  enableNotifications: boolean;
  globalShortcut: string;
  /** `YYYY-MM-DD`; empty until the user sets it. Powers the Life page. */
  birthDate: string;
  /** Life-expectancy horizon (years) for the "life in weeks" grid. */
  lifeExpectancyYears: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCategoryId: "inbox",
  dailyFocusTargetMinutes: 240,
  startWeekOnMonday: true,
  theme: "system",
  enableTray: true,
  enableNotifications: true,
  globalShortcut: "CommandOrControl+Shift+Space",
  birthDate: "",
  lifeExpectancyYears: 80
};
