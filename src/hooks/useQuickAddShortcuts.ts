import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeShortcut(shortcut: string): string {
  return shortcut.trim().replace("CmdOrCtrl", "CommandOrControl").replace("Ctrl", "Control");
}

async function focusMainWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const windowHandle = getCurrentWindow();
    await windowHandle.show();
    await windowHandle.unminimize();
    await windowHandle.setFocus();
  } catch (error) {
    console.warn("Quick add could not focus the main window", error);
  }
}

export function useQuickAddShortcuts() {
  const shortcut = useSettingsStore((state) => state.settings.globalShortcut);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);
  const addToast = useUiStore((state) => state.addToast);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const primaryModifier = event.ctrlKey || event.metaKey;
      if (primaryModifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openQuickAdd();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openQuickAdd]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const normalizedShortcut = normalizeShortcut(shortcut);
    if (!normalizedShortcut) {
      return;
    }

    let disposed = false;

    async function registerShortcut() {
      try {
        const { isRegistered, register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
        if (await isRegistered(normalizedShortcut)) {
          await unregister(normalizedShortcut);
        }

        await register(normalizedShortcut, (event) => {
          if (event.state !== "Pressed") {
            return;
          }

          void focusMainWindow();
          openQuickAdd();
        });

        return async () => {
          await unregister(normalizedShortcut);
        };
      } catch (error) {
        if (!disposed) {
          console.warn("Global quick add shortcut could not be registered", error);
          addToast({
            kind: "error",
            title: "Global shortcut unavailable",
            description: error instanceof Error ? error.message : "Shortcut registration failed"
          });
        }
        return undefined;
      }
    }

    let cleanup: (() => Promise<void>) | undefined;
    void registerShortcut().then((registeredCleanup) => {
      cleanup = registeredCleanup;
      if (disposed && cleanup) {
        void cleanup();
      }
    });

    return () => {
      disposed = true;
      if (cleanup) {
        void cleanup();
      }
    };
  }, [addToast, openQuickAdd, shortcut]);
}
