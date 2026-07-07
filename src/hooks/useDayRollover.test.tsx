import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../components/assistant/_render";
import { useDayRollover } from "./useDayRollover";

const refreshTasks = vi.fn(async () => {});
const refreshRest = vi.fn(async () => {});

vi.mock("../stores/taskStore", () => ({
  useTaskStore: (selector: (state: { refresh: typeof refreshTasks }) => unknown) =>
    selector({ refresh: refreshTasks })
}));

vi.mock("../stores/restStore", () => ({
  useRestStore: (selector: (state: { refreshToday: typeof refreshRest }) => unknown) =>
    selector({ refreshToday: refreshRest })
}));

function Probe() {
  useDayRollover();
  return null;
}

describe("useDayRollover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T14:59:50.000Z")); // 23:59:50 in Tokyo
    refreshTasks.mockClear();
    refreshRest.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes task and rest data after the local day changes", () => {
    render(<Probe />);

    act(() => {
      vi.setSystemTime(new Date("2026-07-06T15:00:20.000Z"));
      vi.advanceTimersByTime(30_000);
    });

    expect(refreshTasks).toHaveBeenCalledTimes(1);
    expect(refreshRest).toHaveBeenCalledTimes(1);
  });

  it("refreshes task and rest data when the visible window regains focus", () => {
    render(<Probe />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(refreshTasks).toHaveBeenCalledTimes(1);
    expect(refreshRest).toHaveBeenCalledTimes(1);
  });
});
