import { create } from "zustand";
import { createId } from "../utils/id";

export type ToastKind = "info" | "success" | "error";

export type ToastAction = {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  onClick: () => void | Promise<unknown>;
};

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  actions?: ToastAction[];
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type ConfirmRequest = ConfirmOptions & {
  id: string;
  resolve: (confirmed: boolean) => void;
};

type UiState = {
  quickAddOpen: boolean;
  toasts: ToastMessage[];
  confirmRequest: ConfirmRequest | null;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  addToast: (toast: Omit<ToastMessage, "id"> & { durationMs?: number }) => void;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  quickAddOpen: false,
  toasts: [],
  confirmRequest: null,
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  addToast: (toast) => {
    const { durationMs = 5000, ...message } = toast;
    const id = createId("toast");
    set((state) => ({ toasts: [...state.toasts, { ...message, id }].slice(-4) }));
    if (durationMs > 0) {
      window.setTimeout(() => {
        useUiStore.getState().dismissToast(id);
      }, durationMs);
    }
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  confirm: (options) => {
    const normalized = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      set((state) => {
        // Resolve any in-flight request as cancelled before replacing it.
        state.confirmRequest?.resolve(false);
        return { confirmRequest: { ...normalized, id: createId("confirm"), resolve } };
      });
    });
  },
  resolveConfirm: (confirmed) =>
    set((state) => {
      state.confirmRequest?.resolve(confirmed);
      return { confirmRequest: null };
    })
}));
