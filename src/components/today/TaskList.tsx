import { useTaskStore } from "../../stores/taskStore";
import { TaskCard } from "./TaskCard";

export function TaskList() {
  const tasks = useTaskStore((state) => state.tasks);

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">What do you want to move forward today?</div>
        Add your first task above.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
