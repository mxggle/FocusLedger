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

const UPSERT_SETTING = `INSERT INTO settings (key, value) VALUES ($1, $2)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`;

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
    await db.execute(UPSERT_SETTING, [key, JSON.stringify(value)]);
  },

  /**
   * Writes several settings that belong together (e.g. the provider, its key
   * and its model all changing as one). Rows go in one at a time — the SQL
   * plugin has no batch API — so a failure part-way can leave the earlier keys
   * written; callers reload or roll back from the value they held.
   */
  async setMany(patch: Partial<AppSettings>): Promise<void> {
    const db = await getDatabase();
    for (const [key, value] of Object.entries(patch)) {
      await db.execute(UPSERT_SETTING, [key, JSON.stringify(value)]);
    }
  }
};
