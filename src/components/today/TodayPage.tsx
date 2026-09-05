import { ListTodo, ScrollText, Timer } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMeasure } from "../../hooks/useMeasure";
import { useRestStore } from "../../stores/restStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { CollapsiblePane } from "../ui/CollapsiblePane";
import { AddTaskForm } from "./AddTaskForm";
import { CurrentFocus } from "./CurrentFocus";
import { RestCard } from "./RestCard";
import { DayHeader } from "./DayHeader";
import { DebriefButton } from "./DebriefButton";
import { TaskList } from "./TaskList";
import { TodayLog } from "./TodayLog";
import { TodaySummary } from "./TodaySummary";

// Preserve usable task/focus widths across the supported desktop window range.
// Focus stays visible; the secondary Log pane gives way first.
//
// These are measured against the *pane row*, not the window. The window is the
// wrong ruler: the sidebar (232px expanded, 64px collapsed) and the assistant
// dock (360-640px, a flex sibling in `content-region`) both take their width
// out of this row without changing `window.innerWidth`, and the dock does not
// fire a `resize` event at all. Sizing off the window meant opening the dock
// left all three panes expanded in ~980px of space, crushing each to ~300px.
const BREAK_LOG = 960;
const BREAK_TASKS = 540;

export function TodayPage() {
  const todayPanes = useUiStore((state) => state.todayPanes);
  const toggleTodayPane = useUiStore((state) => state.toggleTodayPane);
  const setFocusZen = useUiStore((state) => state.setFocusZen);
  const setRestZen = useUiStore((state) => state.setRestZen);
  // A break running behind its card (not zen'd) takes over the Focus pane, the
  // same slot focus minimizes into.
  const resting = useRestStore((state) => Boolean(state.rest));
  const restZen = useUiStore((state) => state.restZen);
  const tasks = useTaskStore((state) => state.tasks);
  const todayEntries = useTaskStore((state) => state.todayEntries);

  const openCount = tasks.filter(
    (task) => task.status !== "done" && task.status !== "dropped"
  ).length;

  // The row the three panes share. Its width is set by the content region, not
  // by the panes inside it, so collapsing a pane cannot feed back into the
  // measurement and start a loop.
  const [paneRowRef, paneRow] = useMeasure<HTMLDivElement>();

  // Panes *we* collapsed, so exactly those re-expand when the room comes back.
  // A ref rather than state: flipping it must not re-run the effect.
  const autoCollapsed = useRef({ log: false, tasks: false });

  // Responsive auto-collapse as the available width changes — window resize,
  // sidebar toggle, or the assistant dock opening and being dragged wider.
  // Auto-collapses never persist (a transient squeeze must not rewrite the
  // saved layout), and panes the user collapsed themselves are left alone in
  // both directions.
  useEffect(() => {
    const width = paneRow.width;
    // Pre-measurement: 0 is "not known yet", not "no room".
    if (width === 0) return;

    function apply(pane: "log" | "tasks", breakpoint: number) {
      // Read fresh pane state — a mount-time snapshot would go stale as the
      // user toggles panes.
      const { todayPanes: panes, setTodayPaneCollapsed } = useUiStore.getState();
      if (width < breakpoint && !panes[pane]) {
        setTodayPaneCollapsed(pane, true, { persist: false });
        autoCollapsed.current[pane] = true;
      } else if (width >= breakpoint && panes[pane] && autoCollapsed.current[pane]) {
        setTodayPaneCollapsed(pane, false, { persist: false });
        autoCollapsed.current[pane] = false;
      }
    }

    apply("log", BREAK_LOG);
    apply("tasks", BREAK_TASKS);
  }, [paneRow.width]);

  return (
    // The day header sits on the aurora canvas; below it the three panes
    // float as separate cards with gaps, so the wash shows through between
    // surfaces instead of the page reading as one partitioned sheet.
    <div className="page-fixed flex flex-col">
      <DayHeader />
      <div ref={paneRowRef} className="flex min-h-0 flex-1 gap-2.5 overflow-hidden px-5 pb-4">
        <CollapsiblePane
          title="Tasks"
          icon={ListTodo}
          meta={openCount > 0 ? `${openCount} open` : undefined}
          collapsed={todayPanes.tasks}
          onToggle={() => toggleTodayPane("tasks")}
        >
          <div className="p-4">
            <AddTaskForm />
            <TaskList />
          </div>
        </CollapsiblePane>

        <CollapsiblePane
          title="Focus"
          icon={Timer}
          collapsed={todayPanes.focus}
          onToggle={() => toggleTodayPane("focus")}
        >
          {/* Flush: the pane card is the focus surface, so the ambient scene
              bleeds to its edges instead of nesting a second card. */}
          <div className="h-full">
            {resting && !restZen ? (
              <RestCard onExpand={() => setRestZen(true)} />
            ) : (
              <CurrentFocus onExpand={() => setFocusZen(true)} />
            )}
          </div>
        </CollapsiblePane>

        <CollapsiblePane
          title="Log"
          icon={ScrollText}
          meta={
            todayEntries.length > 0
              ? `${todayEntries.length} ${todayEntries.length === 1 ? "entry" : "entries"}`
              : undefined
          }
          collapsed={todayPanes.log}
          onToggle={() => toggleTodayPane("log")}
        >
          {/* Summary is sticky at the top; the log list scrolls beneath it. */}
          <TodaySummary />
          <div className="p-4">
            <DebriefButton />
            <TodayLog />
          </div>
        </CollapsiblePane>
      </div>
    </div>
  );
}
