import { useMemo } from "react";
import { computeDayBriefing, type DayBriefing } from "../../services/ai/assistant/dayBriefing";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";

/** Compute today's briefing from live store state (no LLM call). */
export function useDayBriefing(): DayBriefing {
  const tasks = useTaskStore((state) => state.tasks);
  const backlogCount = useTaskStore((state) => state.backlogTasks.length);
  const targetMinutes = useSettingsStore((state) => state.settings.dailyFocusTargetMinutes);

  return useMemo(
    () =>
      computeDayBriefing(
        tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          estimatedMinutes: task.estimated_minutes,
          categoryId: task.category_id,
          plannedStartTime: task.planned_start_time,
          plannedEndTime: task.planned_end_time
        })),
        backlogCount,
        targetMinutes
      ),
    [tasks, backlogCount, targetMinutes]
  );
}
