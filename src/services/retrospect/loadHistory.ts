import { taskRepository } from "../../db/taskRepository";
import { timeEntryRepository } from "../../db/timeEntryRepository";
import type { Task, TimeEntryWithTask } from "../../types";

export type RetrospectiveData = {
  entries: TimeEntryWithTask[];
  tasks: Task[];
};

/** Fetch the trailing window of time entries plus all tasks. Impure boundary. */
export async function loadRetrospectiveData(now: Date, windowDays: number): Promise<RetrospectiveData> {
  const start = new Date(now.getTime() - windowDays * 86_400_000);
  const [entries, tasks] = await Promise.all([
    timeEntryRepository.getEntriesForRange(start.toISOString(), now.toISOString(), now.toISOString()),
    taskRepository.getAll()
  ]);
  return { entries, tasks };
}
