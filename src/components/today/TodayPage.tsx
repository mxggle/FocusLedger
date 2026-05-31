import { AddTaskForm } from "./AddTaskForm";
import { CurrentFocus } from "./CurrentFocus";
import { TaskList } from "./TaskList";
import { TodayLog } from "./TodayLog";
import { TodaySummary } from "./TodaySummary";

export function TodayPage() {
  return (
    <div className="grid h-screen grid-cols-[minmax(320px,0.9fr)_minmax(360px,1fr)_minmax(320px,0.9fr)] overflow-hidden">
      <section className="min-w-0 overflow-y-auto border-r p-5">
        <AddTaskForm />
        <TaskList />
      </section>
      <section className="min-w-0 overflow-y-auto border-r p-5">
        <CurrentFocus />
      </section>
      <section className="min-w-0 overflow-y-auto p-5">
        <TodayLog />
        <TodaySummary />
      </section>
    </div>
  );
}
