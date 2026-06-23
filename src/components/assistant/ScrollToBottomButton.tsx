import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type ScrollToBottomButtonProps = {
  onClick: () => void;
  visible: boolean;
};

export function ScrollToBottomButton({ onClick, visible }: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={onClick}
          aria-label="Scroll to latest"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-4 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-foreground shadow-card hover:bg-surface-2"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Latest
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
