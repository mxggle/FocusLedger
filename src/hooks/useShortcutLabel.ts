import { useSettingsStore } from "../stores/settingsStore";
import { isMac } from "../utils/platform";

const PART_DISPLAY: Record<string, string> = {
  cmdorctrl: isMac ? "⌘" : "Ctrl",
  commandorcontrol: isMac ? "⌘" : "Ctrl",
  alt: isMac ? "⌥" : "Alt",
  shift: isMac ? "⇧" : "Shift",
  ctrl: "Ctrl",
  meta: "⌘",
  super: "⌘"
};

export function useShortcutLabel(): string {
  const shortcut = useSettingsStore((state) => state.settings.globalShortcut);
  if (!shortcut) return "";

  return shortcut
    .split("+")
    .map((part) => {
      const lower = part.trim().toLowerCase();
      return PART_DISPLAY[lower] ?? part.trim().toUpperCase();
    })
    .join(isMac ? "" : "+");
}
