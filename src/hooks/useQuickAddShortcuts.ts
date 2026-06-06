import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

let globalShortcutQueue = Promise.resolve();

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function runGlobalShortcutOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = globalShortcutQueue.then(operation, operation);
  globalShortcutQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function isAlreadyRegisteredError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.toLowerCase().includes("already registered");
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

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const needsCmd = parts.includes("cmdorctrl") || parts.includes("commandorcontrol");
  const needsAlt = parts.includes("alt");
  const needsShift = parts.includes("shift");

  const cmdMatch = needsCmd ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const altMatch = needsAlt ? event.altKey : !event.altKey;
  const shiftMatch = needsShift ? event.shiftKey : !event.shiftKey;
  const keyMatch = event.key.toLowerCase() === key;

  return cmdMatch && altMatch && shiftMatch && keyMatch;
}

export function useQuickAddShortcuts() {
  const shortcut = useSettingsStore((state) => state.settings.globalShortcut);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);
  const addToast = useUiStore((state) => state.addToast);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shortcut && matchesShortcut(event, shortcut)) {
        event.preventDefault();
        openQuickAdd();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openQuickAdd, shortcut]);

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
        return await runGlobalShortcutOperation(async () => {
          if (disposed) {
            return undefined;
          }

          const { register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
          if (disposed) {
            return undefined;
          }

          const handleShortcut = (event: { state: "Released" | "Pressed" }) => {
            if (event.state !== "Pressed") {
              return;
            }

            void focusMainWindow();
            openQuickAdd();
          };

          try {
            await register(normalizedShortcut, handleShortcut);
          } catch (error) {
            if (!isAlreadyRegisteredError(error)) {
              throw error;
            }

            await unregister(normalizedShortcut).catch(() => undefined);
            await register(normalizedShortcut, handleShortcut);
          }

          if (disposed) {
            await unregister(normalizedShortcut);
            return undefined;
          }

          return async () => {
            await runGlobalShortcutOperation(async () => {
              await unregister(normalizedShortcut);
            });
          };
        });
      } catch (error) {
        if (!disposed) {
          console.warn("Global quick add shortcut could not be registered", error);
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Shortcut registration failed";
          addToast({
            kind: "error",
            title: "Global shortcut unavailable",
            description: `${message}. You can change the shortcut in Settings.`
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
