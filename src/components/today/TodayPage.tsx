import { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { CollapsiblePane } from "../ui/CollapsiblePane";
import { AddTaskForm } from "./AddTaskForm";
import { CurrentFocus } from "./CurrentFocus";
import { TaskList } from "./TaskList";
import { TodayLog } from "./TodayLog";
import { TodaySummary } from "./TodaySummary";

// Auto-collapse breakpoints: collapse log at <900px, tasks at <700px; focus stays.
const BREAK_LOG = 900;
const BREAK_TASKS = 700;

export function TodayPage() {
  const todayPanes = useUiStore((state) => state.todayPanes);
  const setTodayPaneCollapsed = useUiStore((state) => state.setTodayPaneCollapsed);
  const toggleTodayPane = useUiStore((state) => state.toggleTodayPane);

  // Responsive auto-collapse on window resize
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      // Only auto-collapse, never auto-expand (respect user choice)
      if (w < BREAK_LOG && !todayPanes.log) {
        setTodayPaneCollapsed("log", true);
      }
      if (w < BREAK_TASKS && !todayPanes.tasks) {
        setTodayPaneCollapsed("tasks", true);
      }
    }

    window.addEventListener("resize", handleResize);
    // Check on mount
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // overflow-hidden ensures panes don't bleed outside; bg-background fills gaps
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Tasks pane — border-r separates from Focus */}
      <CollapsiblePane
        title="Tasks"
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
        collapsed={todayPanes.focus}
        onToggle={() => toggleTodayPane("focus")}
        className="border-r border-border"
      >
        <div className="p-4">
          <CurrentFocus />
        </div>
      </CollapsiblePane>

      {/* Log & Summary pane — no border-r (rightmost).
          Summary is sticky at the top; the log list scrolls beneath it. */}
      <CollapsiblePane
        title="Log"
        collapsed={todayPanes.log}
        onToggle={() => toggleTodayPane("log")}
      >
        <TodaySummary />
        <div className="p-4">
          <TodayLog />
        </div>
      </CollapsiblePane>
    </div>
  );
}
