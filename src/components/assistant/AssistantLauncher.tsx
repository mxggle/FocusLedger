import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { isMac } from "../../utils/platform";

const SHORTCUT = `${isMac ? "⌘" : "Ctrl+"}J`;

/** Floating trigger that opens the docked assistant. Hidden while it's open. */
export function AssistantLauncher() {
  const open = useUiStore((state) => state.assistantOpen);
  const toggle = useUiStore((state) => state.toggleAssistant);
  const settings = useSettingsStore((state) => state.settings);
  const name = settings.assistantName.trim() || "Assistant";

  return (
    <AnimatePresence>
      {!open ? (
        <motion.button
          type="button"
          onClick={toggle}
          aria-label={`Open ${name}`}
          title={`${name} · ${SHORTCUT}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", damping: 18, stiffness: 320 }}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary bg-gradient-accent text-primary-foreground shadow-pop outline-none transition-[transform,box-shadow] hover:scale-105 hover:bg-gradient-accent-hover hover:shadow-glow focus-visible:shadow-ring active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
