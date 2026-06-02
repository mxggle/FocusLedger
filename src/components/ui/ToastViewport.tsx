import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiStore } from "../../stores/uiStore";
import type { ToastKind } from "../../stores/uiStore";
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

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2.5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, iconClass, accentClass, barClass } =
            kindConfig[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-surface p-3.5 pl-4 shadow-pop"
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-1 rounded-r-full",
                  barClass
                )}
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
                  <div className="text-sm font-semibold text-foreground">
                    {toast.title}
                  </div>
                  {toast.description ? (
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {toast.description}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
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
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
