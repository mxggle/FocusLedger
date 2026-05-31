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
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = createId("toast");
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
    window.setTimeout(() => {
      useUiStore.getState().dismissToast(id);
    }, 5000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}));
