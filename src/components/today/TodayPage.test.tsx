import { cleanup, render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "../../stores/uiStore";
import { TooltipProvider } from "../ui/Tooltip";

// The panes' contents are irrelevant here — this covers the responsive
// auto-collapse wiring, not what the panes render.
vi.mock("./AddTaskForm", () => ({ AddTaskForm: () => null }));
vi.mock("./TaskList", () => ({ TaskList: () => null }));
vi.mock("./CurrentFocus", () => ({ CurrentFocus: () => null }));
vi.mock("./RestCard", () => ({ RestCard: () => null }));
vi.mock("./DayHeader", () => ({ DayHeader: () => null }));
vi.mock("./DebriefButton", () => ({ DebriefButton: () => null }));
vi.mock("./TodayLog", () => ({ TodayLog: () => null }));
vi.mock("./TodaySummary", () => ({ TodaySummary: () => null }));
vi.mock("../../stores/restStore", () => ({
  useRestStore: (selector: (s: unknown) => unknown) => selector({ rest: null })
}));
vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) =>
    selector({ tasks: [], todayEntries: [] })
}));

// jsdom has no ResizeObserver and lays everything out at zero, so drive the
// measured width by hand: one observer, whose callback we fire with the width
// under test.
let notify: (width: number) => void = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(target: Element) {
        notify = (width) =>
          act(() => {
            this.cb(
              [{ target, contentRect: { width, height: 600 } } as ResizeObserverEntry],
              this as unknown as ResizeObserver
            );
          });
      }
      unobserve() {}
      disconnect() {}
    }
  );
  useUiStore.setState({ todayPanes: { tasks: false, focus: false, log: false } });
  // Wide window throughout: the row's width is what must drive the layout.
  window.innerWidth = 1600;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function mount() {
  const { TodayPage } = await import("./TodayPage");
  // The pane toggles are tooltip triggers; the real tree provides the
  // provider at the app root.
  render(
    <TooltipProvider>
      <TodayPage />
    </TooltipProvider>
  );
}

const panes = () => useUiStore.getState().todayPanes;

describe("TodayPage responsive panes", () => {
  it("collapses Log, then Tasks, as the pane row narrows", async () => {
    await mount();

    notify(1200);
    expect(panes()).toMatchObject({ log: false, tasks: false });

    notify(900);
    expect(panes()).toMatchObject({ log: true, tasks: false });

    notify(500);
    expect(panes()).toMatchObject({ log: true, tasks: true });
  });

  it("re-expands the panes it collapsed once the room comes back", async () => {
    await mount();

    notify(500);
    expect(panes()).toMatchObject({ log: true, tasks: true });

    notify(1200);
    expect(panes()).toMatchObject({ log: false, tasks: false });
  });

  // The regression this replaced: the breakpoints were measured against
  // `window.innerWidth`, which the assistant dock does not change — it takes
  // its 360-640px out of the pane row instead, and fires no resize event. A
  // wide window with the dock open left all three panes expanded and crushed.
  it("collapses when the dock takes the width, not the window", async () => {
    await mount();

    window.innerWidth = 1600;
    notify(1600 - 232 - 640 - 50);
    expect(panes().log).toBe(true);
  });

  it("leaves a pane the user collapsed alone when the row widens", async () => {
    await mount();
    notify(1200);

    act(() => useUiStore.getState().setTodayPaneCollapsed("log", true));
    notify(1300);
    expect(panes().log).toBe(true);
  });

  // A 0-width measurement is "not laid out yet", not "no room at all".
  it("does not collapse on the pre-measurement zero width", async () => {
    await mount();

    notify(0);
    expect(panes()).toMatchObject({ log: false, tasks: false });
  });
});
