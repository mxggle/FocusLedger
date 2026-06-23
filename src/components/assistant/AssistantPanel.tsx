import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Eraser, Sparkles, X } from "lucide-react";
import { PROVIDER_LABELS, resolveModel } from "../../services/ai/providers";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { isMac } from "../../utils/platform";
import { cn } from "../../utils/cn";
import { IconButton } from "../ui/IconButton";
import { useAssistantStore } from "../../stores/assistantStore";
import { BriefingBanner } from "./BriefingBanner";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

const SHORTCUT = `${isMac ? "⌘" : "Ctrl+"}J`;

export function AssistantPanel() {
  const open = useUiStore((state) => state.assistantOpen);
  const openAssistant = useUiStore((state) => state.openAssistant);
  const close = useUiStore((state) => state.closeAssistant);
  const toggle = useUiStore((state) => state.toggleAssistant);
  const clear = useAssistantStore((s) => s.clear);
  const hasMessages = useAssistantStore((s) => s.messages.length > 0);
  const status = useAssistantStore((s) => s.status);
  const settings = useSettingsStore((state) => state.settings);
  const name = settings.assistantName.trim() || "Assistant";
  const active = status === "thinking" || status === "streaming";
  const provider = PROVIDER_LABELS[settings.aiProvider];
  const model = resolveModel(settings);

  return (
    <>
      {/* Floating trigger — bottom-right, above content, hidden while open. */}
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
            className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop outline-none transition-[transform,box-shadow] hover:scale-105 hover:shadow-md focus-visible:shadow-ring active:scale-95"
          >
            <Sparkles className="h-5 w-5" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <Dialog.Root open={open} onOpenChange={(next) => (next ? openAssistant() : close())}>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px]"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-border bg-background shadow-pop"
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <Dialog.Title className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
                            active ? "animate-pulse bg-primary" : "bg-muted-foreground"
                          )}
                        />
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate">{name}</span>
                        <span className="truncate text-[11px] font-normal text-muted-foreground">
                          {model} · {provider}
                        </span>
                      </span>
                    </Dialog.Title>
                    <div className="flex shrink-0 items-center gap-1">
                      {hasMessages ? (
                        <IconButton icon={Eraser} label="Clear conversation" variant="ghost" size="sm" onClick={clear} />
                      ) : null}
                      <Dialog.Close asChild>
                        <IconButton icon={X} label="Close assistant" variant="ghost" size="sm" />
                      </Dialog.Close>
                    </div>
                  </div>
                  <BriefingBanner />
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
