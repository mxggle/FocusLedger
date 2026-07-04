import { Eraser, SquarePen, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROVIDER_LABELS, resolveModel } from "../../services/ai/providers";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  ASSISTANT_DEFAULT_WIDTH,
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  useUiStore
} from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { IconButton } from "../ui/IconButton";
import { useAssistantStore } from "../../stores/assistantStore";
import { BriefingBanner } from "./BriefingBanner";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { SessionHistoryMenu } from "./SessionHistoryMenu";

/**
 * The assistant as a docked, non-modal rail. It lives inside the app layout
 * (rendered via AppShell's `rightRail`), so opening it reflows the task list
 * beside it rather than covering it. The left edge is a drag handle for resize.
 */
export function AssistantDock() {
  const open = useUiStore((s) => s.assistantOpen);
  const close = useUiStore((s) => s.closeAssistant);
  const width = useUiStore((s) => s.assistantWidth);
  const setWidth = useUiStore((s) => s.setAssistantWidth);
  const confirm = useUiStore((s) => s.confirm);
  const clear = useAssistantStore((s) => s.clear);
  const newSession = useAssistantStore((s) => s.newSession);
  const hasMessages = useAssistantStore((s) => s.messages.length > 0);
  const status = useAssistantStore((s) => s.status);
  const settings = useSettingsStore((state) => state.settings);

  const name = settings.assistantName.trim() || "Assistant";
  const active = status === "thinking" || status === "streaming";
  const provider = PROVIDER_LABELS[settings.aiProvider];
  const model = resolveModel(settings);

  const [dragging, setDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Clearing is irreversible and the button sits one slot away from Close —
  // a misclick must not destroy the conversation.
  const confirmClear = useCallback(() => {
    void (async () => {
      if (
        await confirm({
          title: "Clear conversation",
          message: "Clear this conversation? This can't be undone.",
          confirmLabel: "Clear",
          danger: true
        })
      ) {
        clear();
      }
    })();
  }, [clear, confirm]);

  // Keep the collapsed rail out of the tab order / off the pointer, without
  // unmounting it (preserves chat state + the width transition on both sides).
  useEffect(() => {
    contentRef.current?.toggleAttribute("inert", !open);
  }, [open]);

  // Drag the left edge to resize. The rail is right-anchored, so the target
  // width is the distance from the cursor to the right edge of the window.
  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setDragging(true);
      const onMove = (e: MouseEvent) => setWidth(window.innerWidth - e.clientX);
      const onUp = () => {
        setDragging(false);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setWidth]
  );

  return (
    <aside
      aria-label={name}
      aria-hidden={!open}
      style={{ width: open ? width : 0 }}
      className={cn(
        "relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background",
        !open && "pointer-events-none border-l-0",
        !dragging && "motion-safe:transition-[width] motion-safe:duration-normal"
      )}
    >
      {/* Resize handle — a wide invisible hit area over a thin accent rule.
          Keyboard-operable too: arrows nudge, Enter/double-click resets. */}
      {open ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant"
          aria-valuemin={ASSISTANT_MIN_WIDTH}
          aria-valuemax={ASSISTANT_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onMouseDown={startResize}
          onDoubleClick={() => setWidth(ASSISTANT_DEFAULT_WIDTH)}
          onKeyDown={(event) => {
            // The rail is right-anchored: moving the handle left widens it.
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setWidth(width + 24);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setWidth(width - 24);
            } else if (event.key === "Enter") {
              event.preventDefault();
              setWidth(ASSISTANT_DEFAULT_WIDTH);
            }
          }}
          className="group absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize outline-none"
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 w-px transition-colors",
              dragging
                ? "bg-primary"
                : "bg-transparent group-hover:bg-primary/60 group-focus-visible:bg-primary"
            )}
          />
        </div>
      ) : null}

      {/* Fixed-width content so it doesn't squish while the rail animates open. */}
      <div ref={contentRef} style={{ width }} className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
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
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              icon={SquarePen}
              label="New chat"
              variant="ghost"
              size="sm"
              onClick={newSession}
              disabled={!hasMessages}
            />
            <SessionHistoryMenu />
            {hasMessages ? (
              <IconButton icon={Eraser} label="Clear conversation" variant="ghost" size="sm" onClick={confirmClear} />
            ) : null}
            <IconButton icon={X} label="Close assistant" variant="ghost" size="sm" onClick={close} />
          </div>
        </div>
        <BriefingBanner />
        <MessageList />
        <Composer />
      </div>
    </aside>
  );
}
