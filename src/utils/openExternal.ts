import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Open a URL in the user's default browser.
 *
 * Inside the Tauri desktop shell we route through the opener plugin so links
 * launch the system browser instead of navigating the app's own webview away
 * from the UI. In a plain browser context (vite dev / preview) we fall back to
 * window.open.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      await openUrl(url);
      return;
    } catch (error) {
      // Surface the failure for debugging, then degrade gracefully.
      console.error("Failed to open external URL:", url, error);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
