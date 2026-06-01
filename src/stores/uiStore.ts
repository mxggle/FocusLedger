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

type UiState = {
  quickAddOpen: boolean;
  toasts: ToastMessage[];
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  addToast: (toast: Omit<ToastMessage, "id"> & { durationMs?: number }) => void;
  dismissToast: (id: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  quickAddOpen: false,
  toasts: [],
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
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}));
