import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, flush } from "../components/assistant/_render";
import { readTaskDataChangeToken } from "../db/changeToken";
import { useExternalDataRefresh } from "./useExternalDataRefresh";

vi.mock("../db/changeToken", () => ({
  readTaskDataChangeToken: vi.fn()
}));

const refresh = vi.fn(async () => {});
let initialized = true;

vi.mock("../stores/taskStore", () => ({
  useTaskStore: (selector: (state: { initialized: boolean; refresh: typeof refresh }) => unknown) =>
    selector({ initialized, refresh })
}));

function Probe() {
  useExternalDataRefresh();
  return null;
}

describe("useExternalDataRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    initialized = true;
    refresh.mockClear();
    vi.mocked(readTaskDataChangeToken).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the task store when the shared database changes after mount", async () => {
    let token = "tasks:1";
    vi.mocked(readTaskDataChangeToken).mockImplementation(async () => token);

    render(<Probe />);
    await flush();

    expect(refresh).not.toHaveBeenCalled();

    token = "tasks:2";
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
