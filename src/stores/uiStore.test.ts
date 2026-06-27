import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "./uiStore";

// ── Existing tests ──────────────────────────────────────────────────────────

describe("uiStore addToast", () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] });
  });

  it("adds a toast", () => {
    useUiStore.getState().addToast({ kind: "error", title: "Boom", description: "bad" });
    expect(useUiStore.getState().toasts).toHaveLength(1);
  });

  it("skips an identical toast that is already visible", () => {
    const { addToast } = useUiStore.getState();
    addToast({ kind: "error", title: "Boom", description: "bad" });
    addToast({ kind: "error", title: "Boom", description: "bad" });
    expect(useUiStore.getState().toasts).toHaveLength(1);
  });

  it("still adds toasts that differ in title or description", () => {
    const { addToast } = useUiStore.getState();
    addToast({ kind: "error", title: "Boom", description: "bad" });
    addToast({ kind: "error", title: "Boom", description: "worse" });
    expect(useUiStore.getState().toasts).toHaveLength(2);
  });
});

describe("uiStore confirm", () => {
  beforeEach(() => {
    useUiStore.setState({ confirmRequest: null });
  });

  it("opens a confirm request and resolves true when confirmed", async () => {
    const promise = useUiStore.getState().confirm("Delete this?");

    const request = useUiStore.getState().confirmRequest;
    expect(request).not.toBeNull();
    expect(request?.message).toBe("Delete this?");

    useUiStore.getState().resolveConfirm(true);

    await expect(promise).resolves.toBe(true);
    expect(useUiStore.getState().confirmRequest).toBeNull();
  });

  it("resolves false when cancelled", async () => {
    const promise = useUiStore.getState().confirm({ message: "Drop?", danger: true });
    useUiStore.getState().resolveConfirm(false);

    await expect(promise).resolves.toBe(false);
    expect(useUiStore.getState().confirmRequest).toBeNull();
  });

  it("cancels an in-flight request when a new one replaces it", async () => {
    const first = useUiStore.getState().confirm("First");
    const second = useUiStore.getState().confirm("Second");

    await expect(first).resolves.toBe(false);
    expect(useUiStore.getState().confirmRequest?.message).toBe("Second");

    useUiStore.getState().resolveConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});

// ── New: sidebar collapse ───────────────────────────────────────────────────

describe("uiStore sidebarCollapsed", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarCollapsed: false });
  });

  it("starts collapsed=false by default (after reset)", () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("toggleSidebar flips the collapsed state", () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);

    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });
});

// ── New: today pane collapse ────────────────────────────────────────────────

describe("uiStore todayPanes", () => {
  const defaultPanes = { tasks: false, focus: false, log: false };

  beforeEach(() => {
    useUiStore.setState({ todayPanes: { ...defaultPanes } });
  });

  it("starts with all panes expanded", () => {
    expect(useUiStore.getState().todayPanes).toEqual(defaultPanes);
  });

  it("toggleTodayPane collapses a specific pane", () => {
    useUiStore.getState().toggleTodayPane("tasks");
    expect(useUiStore.getState().todayPanes.tasks).toBe(true);
    expect(useUiStore.getState().todayPanes.focus).toBe(false);
    expect(useUiStore.getState().todayPanes.log).toBe(false);
  });

  it("toggleTodayPane expands a collapsed pane", () => {
    useUiStore.setState({ todayPanes: { tasks: true, focus: false, log: false } });
    useUiStore.getState().toggleTodayPane("tasks");
    expect(useUiStore.getState().todayPanes.tasks).toBe(false);
  });

  it("toggleTodayPane is independent per pane", () => {
    useUiStore.getState().toggleTodayPane("log");
    useUiStore.getState().toggleTodayPane("focus");
    const { tasks, focus, log } = useUiStore.getState().todayPanes;
    expect(tasks).toBe(false);
    expect(focus).toBe(true);
    expect(log).toBe(true);
  });

  it("setTodayPaneCollapsed sets a specific value directly", () => {
    useUiStore.getState().setTodayPaneCollapsed("tasks", true);
    expect(useUiStore.getState().todayPanes.tasks).toBe(true);

    useUiStore.getState().setTodayPaneCollapsed("tasks", false);
    expect(useUiStore.getState().todayPanes.tasks).toBe(false);
  });

  it("immutable: toggleTodayPane returns a new todayPanes object", () => {
    const before = useUiStore.getState().todayPanes;
    useUiStore.getState().toggleTodayPane("log");
    const after = useUiStore.getState().todayPanes;
    expect(after).not.toBe(before);
  });
});

// ── New: today summary expand/collapse ──────────────────────────────────────

describe("uiStore todaySummaryExpanded", () => {
  beforeEach(() => {
    useUiStore.setState({ todaySummaryExpanded: false });
  });

  it("starts collapsed=false by default (after reset)", () => {
    expect(useUiStore.getState().todaySummaryExpanded).toBe(false);
  });

  it("toggleTodaySummary flips the expanded state", () => {
    useUiStore.getState().toggleTodaySummary();
    expect(useUiStore.getState().todaySummaryExpanded).toBe(true);

    useUiStore.getState().toggleTodaySummary();
    expect(useUiStore.getState().todaySummaryExpanded).toBe(false);
  });
});

describe("assistant panel state", () => {
  beforeEach(() => {
    useUiStore.getState().closeAssistant();
  });

  it("toggles and sets assistant open (defaults closed)", () => {
    expect(useUiStore.getState().assistantOpen).toBe(false);
    useUiStore.getState().toggleAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(true);
    useUiStore.getState().closeAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(false);
    useUiStore.getState().openAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(true);
    useUiStore.getState().closeAssistant();
  });

  it("persists open state to localStorage", () => {
    useUiStore.getState().openAssistant();
    expect(localStorage.getItem("fl:assistantOpen")).toBe("true");
    useUiStore.getState().closeAssistant();
    expect(localStorage.getItem("fl:assistantOpen")).toBe("false");
  });
});

describe("assistant dock width", () => {
  it("clamps width within the usable range", () => {
    useUiStore.getState().setAssistantWidth(10_000);
    expect(useUiStore.getState().assistantWidth).toBe(640);
    useUiStore.getState().setAssistantWidth(10);
    expect(useUiStore.getState().assistantWidth).toBe(360);
  });

  it("rounds and persists a width inside the range", () => {
    useUiStore.getState().setAssistantWidth(480.6);
    expect(useUiStore.getState().assistantWidth).toBe(481);
    expect(localStorage.getItem("fl:assistantWidth")).toBe("481");
  });

  it("falls back to the default on a non-finite width", () => {
    useUiStore.getState().setAssistantWidth(Number.NaN);
    expect(useUiStore.getState().assistantWidth).toBe(420);
  });
});

describe("task highlight", () => {
  beforeEach(() => {
    useUiStore.getState().clearHighlightedTask();
  });

  it("sets and clears the highlighted task", () => {
    expect(useUiStore.getState().highlightedTaskId).toBeNull();
    useUiStore.getState().highlightTask("task-1");
    expect(useUiStore.getState().highlightedTaskId).toBe("task-1");
    useUiStore.getState().clearHighlightedTask();
    expect(useUiStore.getState().highlightedTaskId).toBeNull();
  });

  it("auto-clears the highlight after a delay", () => {
    vi.useFakeTimers();
    try {
      useUiStore.getState().highlightTask("task-2");
      expect(useUiStore.getState().highlightedTaskId).toBe("task-2");
      vi.advanceTimersByTime(2500);
      expect(useUiStore.getState().highlightedTaskId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
