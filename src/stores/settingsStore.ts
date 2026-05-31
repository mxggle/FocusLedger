import { create } from "zustand";
import { settingsRepository } from "../db/settingsRepository";
import { DEFAULT_SETTINGS, type AppSettings } from "../types";
import { useUiStore } from "./uiStore";

type SettingsState = {
  settings: AppSettings;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loading: false,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const settings = await settingsRepository.getAll();
      set({ settings, loading: false });
    } catch (error) {
      console.error("Failed to load settings", error);
      useUiStore.getState().addToast({
        kind: "error",
        title: "Settings could not be loaded",
        description: error instanceof Error ? error.message : "Unknown settings error"
      });
      set({ loading: false });
    }
  },

  updateSetting: async (key, value) => {
    const previous = get().settings;
    const next = { ...previous, [key]: value };
    set({ settings: next });

    try {
      await settingsRepository.set(key, value);
      useUiStore.getState().addToast({ kind: "success", title: "Settings saved" });
    } catch (error) {
      console.error("Failed to update setting", error);
      set({ settings: previous });
      useUiStore.getState().addToast({
        kind: "error",
        title: "Setting was not saved",
        description: error instanceof Error ? error.message : "Unknown settings error"
      });
    }
  }
}));
