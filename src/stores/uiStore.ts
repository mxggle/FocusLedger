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

export type TodayPanes = {
  tasks: boolean;
  focus: boolean;
  log: boolean;
};

// ── localStorage persistence helpers ────────────────────────────────────────

const STORAGE_SIDEBAR = "fl:sidebarCollapsed";
const STORAGE_PANES = "fl:todayPanes";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_SIDEBAR) === "true";
  } catch {
    return false;
  }
}

function readTodayPanes(): TodayPanes {
  try {
    const raw = localStorage.getItem(STORAGE_PANES);
    if (!raw) return { tasks: false, focus: false, log: false };
    return JSON.parse(raw) as TodayPanes;
  } catch {
    return { tasks: false, focus: false, log: false };
  }
}

function writeSidebarCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_SIDEBAR, String(value));
  } catch {
    // ignore
  }
}

function writeTodayPanes(value: TodayPanes): void {
  try {
    localStorage.setItem(STORAGE_PANES, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// ── Store type ───────────────────────────────────────────────────────────────

type UiState = {
  // Existing API (unchanged)
  quickAddOpen: boolean;
  toasts: ToastMessage[];
  confirmRequest: ConfirmRequest | null;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  addToast: (toast: Omit<ToastMessage, "id"> & { durationMs?: number }) => void;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;

  // New: layout collapse state
  sidebarCollapsed: boolean;
  todayPanes: TodayPanes;
  toggleSidebar: () => void;
  toggleTodayPane: (pane: keyof TodayPanes) => void;
  setTodayPaneCollapsed: (pane: keyof TodayPanes, collapsed: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  // ── Existing state ─────────────────────────────────────────────────────────
  quickAddOpen: false,
  toasts: [],
  confirmRequest: null,

  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),

  addToast: (toast) => {
    const { durationMs = 5000, ...message } = toast;
    const id = createId("toast");
    set((state) => ({
      toasts: [...state.toasts, { ...message, id }].slice(-4)
    }));
    if (durationMs > 0) {
      window.setTimeout(() => {
        useUiStore.getState().dismissToast(id);
      }, durationMs);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    })),

  confirm: (options) => {
    const normalized =
      typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      set((state) => {
        // Resolve any in-flight request as cancelled before replacing it.
        state.confirmRequest?.resolve(false);
        return {
          confirmRequest: { ...normalized, id: createId("confirm"), resolve }
        };
      });
    });
  },

  resolveConfirm: (confirmed) =>
    set((state) => {
      state.confirmRequest?.resolve(confirmed);
      return { confirmRequest: null };
    }),

  // ── New: layout collapse state (hydrated from localStorage) ───────────────
  sidebarCollapsed: readSidebarCollapsed(),
  todayPanes: readTodayPanes(),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      writeSidebarCollapsed(next);
      return { sidebarCollapsed: next };
    }),

  toggleTodayPane: (pane) =>
    set((state) => {
      const next: TodayPanes = {
        ...state.todayPanes,
        [pane]: !state.todayPanes[pane]
      };
      writeTodayPanes(next);
      return { todayPanes: next };
    }),

  setTodayPaneCollapsed: (pane, collapsed) =>
    set((state) => {
      const next: TodayPanes = { ...state.todayPanes, [pane]: collapsed };
      writeTodayPanes(next);
      return { todayPanes: next };
    })
}));
