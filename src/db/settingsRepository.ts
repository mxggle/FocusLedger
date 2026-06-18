import { getDatabase } from "./client";
import { DEFAULT_SETTINGS, type AppSettings } from "../types";

type SettingsRow = {
  key: string;
  value: string;
};

function parseSettingValue<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const settingsRepository = {
  async getAll(): Promise<AppSettings> {
    const db = await getDatabase();
    const rows = await db.select<SettingsRow[]>("SELECT key, value FROM settings");
    const settings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (row.key in settings) {
        const key = row.key as keyof AppSettings;
        settings[key] = parseSettingValue(row.value, settings[key]) as never;
      }
    }

    // The "popup" notification style was removed; fall back to the system banner
    // for anyone who had it saved.
    if ((settings.notificationStyle as string) === "popup") {
      settings.notificationStyle = "system";
    }
    if (typeof settings.birthDate !== "string") {
      settings.birthDate = "";
    }

    return settings;
  },

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)]
    );
  }
};
