import { create } from "zustand";
import { createId } from "../utils/id";

export type ToastKind = "info" | "success" | "error";

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
};

type UiState = {
  quickAddOpen: boolean;
  toasts: ToastMessage[];
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  quickAddOpen: false,
  toasts: [],
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  addToast: (toast) => {
    const id = createId("toast");
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
    window.setTimeout(() => {
      useUiStore.getState().dismissToast(id);
    }, 5000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}));
