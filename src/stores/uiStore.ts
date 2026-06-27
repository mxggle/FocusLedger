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
const STORAGE_SUMMARY_EXPANDED = "fl:todaySummaryExpanded";
const STORAGE_ASSISTANT_OPEN = "fl:assistantOpen";
const STORAGE_ASSISTANT_WIDTH = "fl:assistantWidth";

// The assistant is a docked rail that reflows the main content, so its width is
// user-tunable within a range that keeps both the chat and the task list usable.
export const ASSISTANT_MIN_WIDTH = 360;
export const ASSISTANT_MAX_WIDTH = 640;
export const ASSISTANT_DEFAULT_WIDTH = 420;

function clampAssistantWidth(value: number): number {
  if (!Number.isFinite(value)) return ASSISTANT_DEFAULT_WIDTH;
  return Math.min(ASSISTANT_MAX_WIDTH, Math.max(ASSISTANT_MIN_WIDTH, Math.round(value)));
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_SIDEBAR) === "true";
  } catch {
    return false;
  }
}

function readAssistantOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_ASSISTANT_OPEN) === "true";
  } catch {
    return false;
  }
}

function readAssistantWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_ASSISTANT_WIDTH);
    return raw ? clampAssistantWidth(Number(raw)) : ASSISTANT_DEFAULT_WIDTH;
  } catch {
    return ASSISTANT_DEFAULT_WIDTH;
  }
}

function writeAssistantOpen(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_ASSISTANT_OPEN, String(value));
  } catch {
    // ignore
  }
}

function writeAssistantWidth(value: number): void {
  try {
    localStorage.setItem(STORAGE_ASSISTANT_WIDTH, String(value));
  } catch {
    // ignore
  }
}

function readSummaryExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_SUMMARY_EXPANDED) === "true";
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

function writeSummaryExpanded(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_SUMMARY_EXPANDED, String(value));
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

// How long the "change just landed" highlight stays lit before auto-clearing.
const TASK_HIGHLIGHT_MS = 2200;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

// ── Store type ───────────────────────────────────────────────────────────────

type UiState = {
  // Existing API (unchanged)
  quickAddOpen: boolean;
  toasts: ToastMessage[];
  confirmRequest: ConfirmRequest | null;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  addToast: (
    toast: Omit<ToastMessage, "id"> & { durationMs?: number }
  ) => string | undefined;
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;

  // New: layout collapse state
  sidebarCollapsed: boolean;
  todayPanes: TodayPanes;
  todaySummaryExpanded: boolean;
  toggleSidebar: () => void;
  toggleTodayPane: (pane: keyof TodayPanes) => void;
  setTodayPaneCollapsed: (pane: keyof TodayPanes, collapsed: boolean) => void;
  toggleTodaySummary: () => void;

  // Focus zen mode — fills the whole app with just the focus stage. Ephemeral
  // (not persisted): reopening the app should never start trapped in zen.
  focusZen: boolean;
  setFocusZen: (value: boolean) => void;
  toggleFocusZen: () => void;

  // Yolo Assistant docked rail. Open state + width persist, so the workspace
  // layout the user set up is restored on relaunch (like an IDE side panel).
  assistantOpen: boolean;
  assistantWidth: number;
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  setAssistantWidth: (width: number) => void;

  // Transient "a change just landed here" highlight. The assistant sets it when
  // a proposed task change is applied, so the affected card flashes + scrolls
  // into view in the (now visible) task list. Auto-clears after a beat.
  highlightedTaskId: string | null;
  highlightTask: (taskId: string) => void;
  clearHighlightedTask: () => void;

  // Cross-component navigation request. Components without access to App's
  // route state (the Today debrief button, the scheduled-debrief toast) set
  // this; App applies it and clears it. `null` means no pending navigation.
  requestedRoute: string | null;
  requestRoute: (route: string) => void;
  clearRequestedRoute: () => void;
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

    // Skip if an identical toast is already visible (prevents duplicates from
    // double-fired effects, e.g. StrictMode mounting an effect twice).
    const existing = useUiStore.getState().toasts;
    const isDuplicate = existing.some(
      (t) =>
        t.kind === message.kind &&
        t.title === message.title &&
        t.description === message.description
    );
    if (isDuplicate) {
      return undefined;
    }

    const id = createId("toast");
    set((state) => ({
      toasts: [...state.toasts, { ...message, id }].slice(-4)
    }));
    if (durationMs > 0) {
      window.setTimeout(() => {
        useUiStore.getState().dismissToast(id);
      }, durationMs);
    }
    return id;
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    })),

  dismissAllToasts: () => set({ toasts: [] }),

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
  todaySummaryExpanded: readSummaryExpanded(),

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
    }),

  toggleTodaySummary: () =>
    set((state) => {
      const next = !state.todaySummaryExpanded;
      writeSummaryExpanded(next);
      return { todaySummaryExpanded: next };
    }),

  focusZen: false,
  setFocusZen: (value) => set({ focusZen: value }),
  toggleFocusZen: () => set((state) => ({ focusZen: !state.focusZen })),

  assistantOpen: readAssistantOpen(),
  assistantWidth: readAssistantWidth(),
  openAssistant: () => {
    writeAssistantOpen(true);
    set({ assistantOpen: true });
  },
  closeAssistant: () => {
    writeAssistantOpen(false);
    set({ assistantOpen: false });
  },
  toggleAssistant: () =>
    set((state) => {
      const next = !state.assistantOpen;
      writeAssistantOpen(next);
      return { assistantOpen: next };
    }),
  setAssistantWidth: (width) =>
    set(() => {
      const next = clampAssistantWidth(width);
      writeAssistantWidth(next);
      return { assistantWidth: next };
    }),

  highlightedTaskId: null,
  highlightTask: (taskId) => {
    if (highlightTimer) clearTimeout(highlightTimer);
    set({ highlightedTaskId: taskId });
    highlightTimer = setTimeout(() => {
      useUiStore.getState().clearHighlightedTask();
    }, TASK_HIGHLIGHT_MS);
  },
  clearHighlightedTask: () => {
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = undefined;
    set({ highlightedTaskId: null });
  },

  requestedRoute: null,
  requestRoute: (route) => set({ requestedRoute: route }),
  clearRequestedRoute: () => set({ requestedRoute: null })
}));
