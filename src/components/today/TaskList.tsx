import { useMemo } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { toDateKey } from "../../utils/date";
import { partitionTodayTasks } from "../../utils/taskGrouping";
import { Badge } from "../ui/Badge";
import { TaskCard } from "./TaskCard";

export function TaskList() {
  const tasks = useTaskStore((state) => state.tasks);
  const today = toDateKey();
  const { overdue, today: todayTasks } = useMemo(() => partitionTodayTasks(tasks, today), [tasks, today]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">What do you want to move forward today?</div>
        Add your first task above.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {overdue.length > 0 ? (
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400">Overdue</h3>
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200">
              {overdue.length}
            </Badge>
          </div>
          {overdue.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-3">
        {overdue.length > 0 ? <h3 className="text-sm font-semibold">Today</h3> : null}
        {todayTasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Nothing scheduled for today yet.
          </div>
        ) : (
          todayTasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </section>
    </div>
  );
}
