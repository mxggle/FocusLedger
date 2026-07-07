import { create } from "zustand";
import { settingsRepository } from "../db/settingsRepository";
import { DEFAULT_SETTINGS, type AppSettings } from "../types";
import { useUiStore } from "./uiStore";

/** Focus-atmosphere settings change rapidly (slider drags, style flipping);
 *  they update in-memory at once and persist debounced, with no per-change
 *  toast. */
type AmbientKey =
  | "ambientScene"
  | "ambientSounds"
  | "ambientMasterVolume"
  | "ambientMuted"
  | "focusClockStyle";

type SettingsState = {
  settings: AppSettings;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  /** Quiet, debounced update for ambient settings — no toast, coalesced writes. */
  updateAmbient: <K extends AmbientKey>(key: K, value: AppSettings[K]) => void;
};

const AMBIENT_PERSIST_MS = 250;
const ambientPersistTimers: Partial<Record<AmbientKey, ReturnType<typeof setTimeout>>> = {};

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
  },

  updateAmbient: (key, value) => {
    set({ settings: { ...get().settings, [key]: value } });
    const pending = ambientPersistTimers[key];
    if (pending) clearTimeout(pending);
    ambientPersistTimers[key] = setTimeout(() => {
      delete ambientPersistTimers[key];
      settingsRepository.set(key, value).catch((error) => {
        console.error("Failed to persist ambient setting", error);
      });
    }, AMBIENT_PERSIST_MS);
  }
}));
