import { ListTodo, ScrollText, Timer } from "lucide-react";
import { useEffect } from "react";
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
const BREAK_LOG = 1240;
const BREAK_TASKS = 820;

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

  // Responsive auto-collapse on window resize. Auto-collapses never persist —
  // a transient window shrink must not rewrite the saved layout — and panes
  // *we* collapsed re-expand when the window grows back. Panes the user
  // collapsed themselves are left alone in both directions.
  useEffect(() => {
    const autoCollapsed = { log: false, tasks: false };

    function apply(pane: "log" | "tasks", breakpoint: number, width: number) {
      // Read fresh pane state — a mount-time snapshot would go stale as the
      // user toggles panes.
      const { todayPanes: panes, setTodayPaneCollapsed } = useUiStore.getState();
      if (width < breakpoint && !panes[pane]) {
        setTodayPaneCollapsed(pane, true, { persist: false });
        autoCollapsed[pane] = true;
      } else if (width >= breakpoint && panes[pane] && autoCollapsed[pane]) {
        setTodayPaneCollapsed(pane, false, { persist: false });
        autoCollapsed[pane] = false;
      }
    }

    function handleResize() {
      const w = window.innerWidth;
      apply("log", BREAK_LOG, w);
      apply("tasks", BREAK_TASKS, w);
    }

    window.addEventListener("resize", handleResize);
    // Check on mount
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    // The day header sits on the aurora canvas; below it the three panes
    // float as separate cards with gaps, so the wash shows through between
    // surfaces instead of the page reading as one partitioned sheet.
    <div className="flex h-full flex-col overflow-hidden">
      <DayHeader />
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden px-5 pb-4">
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
