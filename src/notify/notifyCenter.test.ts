import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFY_ACTION_EVENT } from "./types";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import { ensureNotifyCenter, showStyledNotification } from "./notifyCenter";

type ListenCallback = (event: { payload: unknown }) => void;

// notifyCenter registers its listeners once for the module's lifetime, so we
// capture the real action callback the first time and reuse it across tests.
let actionCallback: ListenCallback | undefined;

describe("notifyCenter", () => {
  beforeEach(async () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
    listenMock.mockImplementation(async (name: string, cb: ListenCallback) => {
      if (name === NOTIFY_ACTION_EVENT) {
        actionCallback = cb;
      }
      return () => {};
    });
    await ensureNotifyCenter();
  });

  it("serializes actions to id/label/variant without leaking closures", async () => {
    await showStyledNotification("popup", {
      title: "Task is ready",
      description: "Start now?",
      actions: [
        { label: "Start", variant: "primary", onClick: () => {} },
        { label: "Snooze", onClick: () => {} }
      ]
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "show_notification_window",
      expect.objectContaining({ kind: "popup" })
    );

    const payload = invokeMock.mock.calls[0][1].payload;
    expect(payload.title).toBe("Task is ready");
    expect(payload.kind).toBe("info");
    expect(payload.actions).toEqual([
      { actionId: "a0", label: "Start", variant: "primary" },
      { actionId: "a1", label: "Snooze", variant: undefined }
    ]);
    // No behavior may cross the window boundary.
    for (const action of payload.actions) {
      expect("onClick" in action).toBe(false);
    }
  });

  it("routes an action event back to the matching handler", async () => {
    const start = vi.fn();
    const snooze = vi.fn();
    await showStyledNotification("fullscreen", {
      title: "Time's up",
      description: "Continue?",
      actions: [
        { label: "Continue", onClick: start },
        { label: "Snooze", onClick: snooze }
      ]
    });

    const { notificationId } = invokeMock.mock.calls.at(-1)![1].payload;
    expect(actionCallback).toBeDefined();

    actionCallback?.({ payload: { notificationId, actionId: "a0" } });

    expect(start).toHaveBeenCalledTimes(1);
    expect(snooze).not.toHaveBeenCalled();
  });

  it("does not re-run a handler after its notification is consumed", async () => {
    const handler = vi.fn();
    await showStyledNotification("popup", {
      title: "Once",
      description: "Only once",
      actions: [{ label: "Do it", onClick: handler }]
    });

    const { notificationId } = invokeMock.mock.calls.at(-1)![1].payload;
    actionCallback?.({ payload: { notificationId, actionId: "a0" } });
    actionCallback?.({ payload: { notificationId, actionId: "a0" } });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
