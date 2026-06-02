import { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "./Button";

export function ConfirmDialog() {
  const request = useUiStore((state) => state.confirmRequest);
  const resolveConfirm = useUiStore((state) => state.resolveConfirm);

  useEffect(() => {
    if (!request) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        resolveConfirm(false);
      } else if (event.key === "Enter") {
        resolveConfirm(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request, resolveConfirm]);

  if (!request) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={() => resolveConfirm(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-md border bg-background p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {request.title ? <h2 className="text-lg font-semibold">{request.title}</h2> : null}
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{request.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => resolveConfirm(false)}>
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
      </div>
    </div>
  );
}
