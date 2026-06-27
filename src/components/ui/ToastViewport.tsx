import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import type { ToastKind, ToastMessage } from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

const kindConfig: Record<
  ToastKind,
  {
    icon: typeof Info;
    iconClass: string;
    accentClass: string;
    barClass: string;
  }
> = {
  info: {
    icon: Info,
    iconClass: "text-primary",
    accentClass: "bg-primary-soft ring-primary/15",
    barClass: "bg-primary"
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-success",
    accentClass: "bg-success-soft ring-success/20",
    barClass: "bg-success"
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    accentClass: "bg-destructive-soft ring-destructive/20",
    barClass: "bg-destructive"
  }
};

// Layout constants for the stacked deck. The toasts array holds oldest→newest,
// so the newest sits at the bottom (front) of the bottom-anchored stack.
const GAP = 10; // vertical gap between cards when the stack is expanded
const PEEK = 12; // sliver of each older card revealed above the front when collapsed
const MAX_PEEK = 2; // how many older cards peek behind the front before they fade out

/**
 * Bottom-right notification stack. A single reminder shows as a normal card.
 * When several pile up (e.g. start / planned-end / over-estimate firing close
 * together), they collapse into a tidy deck — only the newest is fully shown
 * and actionable, with a count + "Clear all" header — and fan out into the full
 * list on hover/focus so every reminder's actions stay reachable. This keeps the
 * footprint to roughly one card tall instead of overflowing off-screen.
 */
export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const dismissAllToasts = useUiStore((state) => state.dismissAllToasts);
  const reduceMotion = useReducedMotion();

  const [expanded, setExpanded] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Measure natural card heights so the deck can fan cards out precisely when
  // expanded regardless of how much text/how many actions each one carries.
  // Transforms (scale) don't affect offsetHeight, so this stays stable.
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    cardRefs.current.forEach((el, id) => {
      next[id] = el.offsetHeight;
    });
    setHeights((prev) => {
      const ids = Object.keys(next);
      const same =
        ids.length === Object.keys(prev).length &&
        ids.every((id) => prev[id] === next[id]);
      return same ? prev : next;
    });
  }, [toasts]);

  const registerCard = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(id, el);
      } else {
        cardRefs.current.delete(id);
      }
    },
    []
  );

  const count = toasts.length;
  const collapsed = !expanded && count > 1;

  // Cumulative offset (measured from the bottom) for the expanded layout: each
  // card sits above all the cards in front of it (closer to the bottom).
  const expandedOffsetByDepth: number[] = [];
  {
    let acc = 0;
    for (let depth = 0; depth < count; depth += 1) {
      expandedOffsetByDepth[depth] = acc;
      // depth d is the (count-1-d)-th toast; its height feeds the next one up.
      const id = toasts[count - 1 - depth]?.id;
      acc += (id ? heights[id] ?? 0 : 0) + GAP;
    }
  }

  // Reserve container height so the absolutely-positioned cards don't collapse
  // the layout (and so the header pill rides just above the top card).
  const frontId = toasts[count - 1]?.id;
  const frontHeight = frontId ? heights[frontId] ?? 0 : 0;
  let stackHeight = frontHeight;
  if (count > 1) {
    if (expanded) {
      const topDepth = count - 1;
      const topId = toasts[0]?.id;
      stackHeight = expandedOffsetByDepth[topDepth] + (topId ? heights[topId] ?? 0 : 0);
    } else {
      stackHeight = frontHeight + PEEK * Math.min(count - 1, MAX_PEEK);
    }
  }

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setExpanded(false);
        }
      }}
      // The region is the hover boundary (pointer-events-auto): it only ever
      // grows upward on expand (bottom edge is pinned), so the cursor stays
      // inside its box during the transition. Keeping hover detection on a
      // transparent (pointer-events-none) region would let the header slide out
      // from under the cursor onto dead space, firing mouseleave → collapse →
      // mouseenter → expand in a loop (the "Clear all" button jumping around).
      className="pointer-events-auto fixed bottom-4 right-4 z-50 flex w-[360px] flex-col items-stretch gap-2"
    >
      <AnimatePresence initial={false}>
        {count > 1 ? (
          <motion.div
            key="toast-header"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
          >
            <span className="font-medium text-muted-foreground">
              {count} reminders
            </span>
            <button
              type="button"
              onClick={dismissAllToasts}
              className="rounded-md px-1.5 py-0.5 font-medium text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:shadow-ring"
            >
              Clear all
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="relative w-full"
        animate={{ height: stackHeight || "auto" }}
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }
        }
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast, index) => {
            const depth = count - 1 - index; // 0 = newest / front of the deck
            const isFront = depth === 0;
            const hidden = collapsed && depth > MAX_PEEK;

            const animate = collapsed
              ? {
                  y: -depth * PEEK,
                  scale: 1 - depth * 0.05,
                  opacity: hidden ? 0 : isFront ? 1 : 0.6
                }
              : {
                  y: -expandedOffsetByDepth[depth],
                  scale: 1,
                  opacity: 1
                };

            return (
              <motion.div
                key={toast.id}
                ref={registerCard(toast.id)}
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={animate}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 34 }
                }
                style={{
                  zIndex: count - depth,
                  pointerEvents: isFront || expanded ? "auto" : "none"
                }}
                className="absolute inset-x-0 bottom-0"
                aria-hidden={hidden}
              >
                <ToastCard toast={toast} onDismiss={() => dismissToast(toast.id)} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const dismissToast = useUiStore((state) => state.dismissToast);
  const { icon: Icon, iconClass, accentClass, barClass } = kindConfig[toast.kind];

  return (
    <div className="pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-surface p-3.5 pl-4 shadow-pop">
      <span
        className={cn("absolute inset-y-0 left-0 w-1 rounded-r-full", barClass)}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            accentClass
          )}
        >
          <Icon className={cn("h-4 w-4", iconClass)} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-sm font-semibold text-foreground">{toast.title}</div>
          {toast.description ? (
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {toast.description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:shadow-ring"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {toast.actions?.length ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {toast.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.variant ?? "secondary"}
              onClick={() => {
                dismissToast(toast.id);
                void action.onClick();
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
