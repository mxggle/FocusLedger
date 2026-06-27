import { useEffect } from "react";
import { useUiStore } from "../stores/uiStore";

/**
 * Toggle the assistant with Cmd/Ctrl+J. In-app only (a window keydown
 * listener) — intentionally not an OS-level global shortcut, to avoid
 * colliding with the quick-add global shortcut registration.
 */
export function useAssistantShortcut() {
  const toggleAssistant = useUiStore((state) => state.toggleAssistant);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleAssistant();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleAssistant]);
}
