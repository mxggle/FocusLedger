import { AlertTriangle, Info } from "lucide-react";
import { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "./Button";
import { Dialog, DialogDescription, DialogTitle } from "./Dialog";

export function ConfirmDialog() {
  const request = useUiStore((state) => state.confirmRequest);
  const resolveConfirm = useUiStore((state) => state.resolveConfirm);

  useEffect(() => {
    if (!request) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Radix handles Esc; we add Enter-to-confirm.
      if (event.key === "Enter") resolveConfirm(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request, resolveConfirm]);

  const Icon = request?.danger ? AlertTriangle : Info;

  return (
    <Dialog
      open={Boolean(request)}
      onClose={() => resolveConfirm(false)}
      size="sm"
      className="p-5"
      ariaLabel={request?.title ? undefined : "Confirm"}
    >
      {request ? (
        <>
          <div className="flex items-start gap-3.5">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                request.danger
                  ? "bg-destructive-soft text-destructive ring-destructive/20"
                  : "bg-primary-soft text-primary ring-primary/15"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              {request.title ? <DialogTitle>{request.title}</DialogTitle> : null}
              <DialogDescription className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {request.message}
              </DialogDescription>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => resolveConfirm(false)}
            >
              {request.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              variant={request.danger ? "danger" : "primary"}
              autoFocus
              onClick={() => resolveConfirm(true)}
            >
              {request.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
