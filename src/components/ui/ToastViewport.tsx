import { X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 grid w-80 gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "rounded-md border bg-background p-3 shadow-lg",
            toast.kind === "error" && "border-destructive/50",
            toast.kind === "success" && "border-green-600/40"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description ? <div className="mt-1 text-xs text-muted-foreground">{toast.description}</div> : null}
            </div>
            <button type="button" onClick={() => dismissToast(toast.id)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
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
      ))}
    </div>
  );
}
