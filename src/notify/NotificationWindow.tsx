import { invoke } from "@tauri-apps/api/core";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants
} from "framer-motion";
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { cn } from "../utils/cn";
import {
  NOTIFY_SHOW_EVENT,
  type NotifyKind,
  type NotifyPayload,
  type NotifyWindowKind
} from "./types";

// Soft tinted tile (icon glyph chip) for the fullscreen moment, where the
// semantic kind carries meaning.
const kindTile: Record<NotifyKind, string> = {
  info: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  error: "bg-destructive-soft text-destructive-soft-foreground"
};

// A small editorial eyebrow gives the fullscreen moment a calm, intentional tone
// (Linear/Things vibe) instead of a generic alert dialog.
const kindEyebrow: Record<NotifyKind, string> = {
  info: "Reminder",
  success: "All done",
  error: "Heads up"
};

// Native macOS easing: a confident ease-out with no jitter, used for content
// settling.
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Renders inside the fullscreen aux window (never in the main window). It is
 * view-only: it pulls the payload that main staged in Rust, listens for
 * refreshes, and reports button presses back to main via events.
 */
export function NotificationWindow({ role }: { role: NotifyWindowKind }) {
  const [payload, setPayload] = useState<NotifyPayload | null>(null);
  // Drives the enter/exit animation independently of the payload so the exit can
  // finish painting before the Rust window actually closes.
  const [visible, setVisible] = useState(false);
  // Distinguishes "exit because we're closing the window" from "exit because a
  // newer notification is swapping in" (window reuse) — only the former closes.
  const closingRef = useRef(false);
  // The window is created hidden to avoid an opaque background flash; we reveal
  // it (once) only after the first transparent frame has painted.
  const revealedRef = useRef(false);

  // Aux windows have no settings store; mirror the OS color scheme so the
  // Tailwind theme tokens resolve correctly.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  // The fullscreen overlay is transparent (it shows the desktop through it), so
  // clear the page background and let the content paint its own surfaces.
  useEffect(() => {
    const root = document.documentElement;
    const prevRoot = root.style.background;
    const prevBody = document.body.style.background;
    root.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      root.style.background = prevRoot;
      document.body.style.background = prevBody;
    };
  }, []);

  // Pull the staged payload on mount, then keep listening so a reused window
  // updates when a newer notification replaces the current one.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const initial = await invoke<NotifyPayload | null>("take_notification_payload", {
          label: role
        });
        if (!cancelled && initial) {
          setPayload(initial);
          setVisible(true);
        }
        const { listen } = await import("@tauri-apps/api/event");
        const listener = await listen<NotifyPayload>(NOTIFY_SHOW_EVENT, (event) => {
          closingRef.current = false;
          setPayload(event.payload);
          setVisible(true);
        });
        if (cancelled) {
          listener();
        } else {
          unlisten = listener;
        }
      } catch (error) {
        console.warn("Notification window could not load its payload", error);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [role]);

  // Reveal the hidden window only after React has committed the transparent
  // background + content and the browser has painted it (double rAF). This is
  // the key to killing the full-screen flash: the very first visible frame is
  // already transparent, so the desktop shows through as the scrim fades in.
  useEffect(() => {
    if (!payload || !visible || revealedRef.current) {
      return;
    }
    revealedRef.current = true;
    const rafs: number[] = [];
    rafs.push(
      requestAnimationFrame(() => {
        rafs.push(
          requestAnimationFrame(() => {
            void invoke("reveal_notification_window", { kind: role }).catch((error) => {
              console.warn("Notification window could not reveal", error);
            });
          })
        );
      })
    );
    return () => rafs.forEach((id) => cancelAnimationFrame(id));
  }, [payload, visible, role]);

  async function emitEvent(name: string, data: unknown) {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(name, data);
  }

  async function closeSelf() {
    try {
      // Passing the id lets Rust detect a newer staged notification and keep
      // the window alive for it instead of closing (see close_notification_window).
      await invoke("close_notification_window", {
        kind: role,
        notificationId: payload?.notificationId ?? null
      });
    } catch (error) {
      console.warn("Notification window could not close", error);
    }
  }

  // Begin the close animation; the window only closes once the exit finishes
  // (see onExitComplete) so the motion is never cut off.
  function beginClose() {
    closingRef.current = true;
    setVisible(false);
  }

  async function runAction(actionId: string) {
    if (!payload) {
      return;
    }
    await emitEvent("notif://action", { notificationId: payload.notificationId, actionId });
    beginClose();
  }

  async function dismiss() {
    if (payload) {
      await emitEvent("notif://dismiss", { notificationId: payload.notificationId });
    }
    beginClose();
  }

  // A fullscreen takeover must always have a keyboard exit.
  useEffect(() => {
    if (!payload || !visible) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void dismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss is stable per payload
  }, [payload, visible]);

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        if (closingRef.current) {
          void closeSelf();
        }
      }}
    >
      {payload && visible ? (
        <FullscreenView
          key={payload.notificationId}
          payload={payload}
          onAction={runAction}
          onDismiss={dismiss}
        />
      ) : null}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Full screen — a calm, deliberate interrupt over a frosted desktop.          */
/* -------------------------------------------------------------------------- */

function FullscreenView({
  payload,
  onAction,
  onDismiss
}: {
  payload: NotifyPayload;
  onAction: (actionId: string) => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();

  const scrim: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: reduceMotion ? 0.12 : 0.34, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }
  };

  // The panel rises and settles with a soft spring — Apple's full-screen
  // takeovers (Screen Time, Focus) feel weighted, not snappy.
  const panelTransition: Transition = reduceMotion
    ? { duration: 0.14 }
    : { type: "spring", stiffness: 260, damping: 26, mass: 0.9 };

  const panel: Variants = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: panelTransition },
        exit: { opacity: 0, transition: { duration: 0.16 } }
      }
    : {
        initial: { opacity: 0, y: 18, scale: 0.95 },
        animate: { opacity: 1, y: 0, scale: 1, transition: panelTransition },
        exit: { opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }
      };

  // Content settles in a gentle cascade after the panel lands.
  const content: Variants = {
    animate: {
      transition: reduceMotion ? {} : { staggerChildren: 0.06, delayChildren: 0.12 }
    }
  };
  const item: Variants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } }
      };

  return (
    <motion.div
      variants={scrim}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background/55 p-8 backdrop-blur-2xl"
    >
      {/* Soft focal glow behind the panel keeps the eye centered. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]"
      />

      <motion.div
        variants={panel}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-border/60 bg-surface/80 px-10 pb-9 pt-11 text-center shadow-2xl backdrop-blur-2xl"
      >
        <motion.div variants={content} initial="initial" animate="animate">
          <motion.div variants={item} className="relative mx-auto mb-6 h-16 w-16">
            {!reduceMotion ? (
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/25 blur-xl"
                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.2, 0.5] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                "relative grid h-16 w-16 place-items-center rounded-full",
                kindTile[payload.kind]
              )}
            >
              <Clock className="h-7 w-7" aria-hidden="true" />
            </span>
          </motion.div>

          <motion.p
            variants={item}
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            {kindEyebrow[payload.kind]}
          </motion.p>
          <motion.h1
            variants={item}
            className="text-[26px] font-semibold leading-tight tracking-tight text-foreground"
          >
            {payload.title}
          </motion.h1>
          <motion.p
            variants={item}
            className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground"
          >
            {payload.description}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          >
            {payload.actions.map((action) => (
              <Button
                key={action.actionId}
                type="button"
                size="lg"
                variant={action.variant ?? "secondary"}
                onClick={() => onAction(action.actionId)}
              >
                {action.label}
              </Button>
            ))}
            <Button type="button" size="lg" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
