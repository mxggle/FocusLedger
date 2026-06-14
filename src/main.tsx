import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { NotificationWindow } from "./notify/NotificationWindow";
import type { NotifyWindowKind } from "./notify/types";
import "./styles.css";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const AUX_WINDOWS = new Set<string>(["popup", "fullscreen"]);

/**
 * One bundle serves every window. The label tells us which: the popup and
 * fullscreen windows render only the lightweight notification view (no DB,
 * no stores); everything else is the main app.
 */
async function resolveRoot(): Promise<React.ReactElement> {
  if (isTauriRuntime()) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = getCurrentWebviewWindow().label;
      if (AUX_WINDOWS.has(label)) {
        return <NotificationWindow role={label as NotifyWindowKind} />;
      }
    } catch {
      // Fall through to the main app.
    }
  }
  return <App />;
}

void (async () => {
  const root = await resolveRoot();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{root}</React.StrictMode>
  );
})();
