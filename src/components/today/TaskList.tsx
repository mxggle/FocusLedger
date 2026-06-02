import { ListTodo } from "lucide-react";
import { useMemo } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { toDateKey } from "../../utils/date";
import { partitionTodayTasks } from "../../utils/taskGrouping";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { TaskCard } from "./TaskCard";

export function TaskList() {
  const tasks = useTaskStore((state) => state.tasks);
  const today = toDateKey();
  const { overdue, today: todayTasks } = useMemo(
    () => partitionTodayTasks(tasks, today),
    [tasks, today]
  );

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="What do you want to move forward today?"
        hint="Add your first task above."
        dashed
      />
    );
  }

  return (
    <div className="grid gap-5">
      {overdue.length > 0 ? (
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-warning-soft-foreground">
              Overdue
            </h3>
            <Badge variant="warning">{overdue.length}</Badge>
          </div>
          {overdue.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-3">
        {overdue.length > 0 ? (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today
          </h3>
        ) : null}
        {todayTasks.length === 0 ? (
          <EmptyState
            title="Nothing scheduled for today yet."
            hint="Add a task above or move one from backlog."
            dashed
          />
        ) : (
          todayTasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </section>
    </div>
  );
}
