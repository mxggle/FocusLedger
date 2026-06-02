import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

// ── Existing tests ──────────────────────────────────────────────────────────

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
