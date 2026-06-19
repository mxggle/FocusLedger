import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Eraser, Sparkles, X } from "lucide-react";
import { useAssistantStore } from "../../stores/assistantStore";
import { useUiStore } from "../../stores/uiStore";
import { IconButton } from "../ui/IconButton";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export function AssistantPanel() {
  const open = useUiStore((state) => state.assistantOpen);
  const setOpen = useUiStore((state) => (state.assistantOpen ? state.closeAssistant : state.openAssistant));
  const toggle = useUiStore((state) => state.toggleAssistant);
  const close = useUiStore((state) => state.closeAssistant);
  const clear = useAssistantStore((state) => state.clear);
  const hasMessages = useAssistantStore((state) => state.messages.length > 0);

  return (
    <>
      {/* Floating trigger — bottom-right, above content, hidden while open. */}
      {!open ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Open assistant"
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      ) : null}

      <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen() : close())}>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40 bg-black/20"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-border bg-background shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Assistant
                    </Dialog.Title>
                    <div className="flex items-center gap-1">
                      {hasMessages ? (
                        <IconButton icon={Eraser} label="Clear conversation" variant="ghost" size="sm" onClick={clear} />
                      ) : null}
                      <Dialog.Close asChild>
                        <IconButton icon={X} label="Close assistant" variant="ghost" size="sm" />
                      </Dialog.Close>
                    </div>
                  </div>
                  <MessageList />
                  <Composer />
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
