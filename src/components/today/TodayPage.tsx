import { ListTodo, ScrollText, Timer } from "lucide-react";
import { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { CollapsiblePane } from "../ui/CollapsiblePane";
import { AddTaskForm } from "./AddTaskForm";
import { CurrentFocus } from "./CurrentFocus";
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

  // Responsive auto-collapse on window resize
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      // Read fresh pane state — a mount-time snapshot would go stale as the
      // user toggles panes. Only auto-collapse, never auto-expand.
      const { todayPanes: panes, setTodayPaneCollapsed } = useUiStore.getState();
      if (w < BREAK_LOG && !panes.log) {
        setTodayPaneCollapsed("log", true);
      }
      if (w < BREAK_TASKS && !panes.tasks) {
        setTodayPaneCollapsed("tasks", true);
      }
    }

    window.addEventListener("resize", handleResize);
    // Check on mount
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    // overflow-hidden ensures panes don't bleed outside; the shell's aurora
    // canvas shows through the gaps, so no opaque background here.
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Tasks pane — border-r separates from Focus */}
      <CollapsiblePane
        title="Tasks"
        icon={ListTodo}
        collapsed={todayPanes.tasks}
        onToggle={() => toggleTodayPane("tasks")}
        className="border-r border-border"
      >
        <div className="p-4">
          <AddTaskForm />
          <TaskList />
        </div>
      </CollapsiblePane>

      {/* Focus pane — border-r separates from Log */}
      <CollapsiblePane
        title="Focus"
        icon={Timer}
        collapsed={todayPanes.focus}
        onToggle={() => toggleTodayPane("focus")}
        className="border-r border-border"
      >
        <div className="h-full p-4">
          <CurrentFocus onExpand={() => setFocusZen(true)} />
        </div>
      </CollapsiblePane>

      {/* Log & Summary pane — no border-r (rightmost).
          Summary is sticky at the top; the log list scrolls beneath it. */}
      <CollapsiblePane
        title="Log"
        icon={ScrollText}
        collapsed={todayPanes.log}
        onToggle={() => toggleTodayPane("log")}
      >
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
