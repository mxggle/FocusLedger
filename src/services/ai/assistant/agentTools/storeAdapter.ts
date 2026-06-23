import { useTaskStore } from "../../../../stores/taskStore";
import type { CreateTaskInput, UpdateTaskInput } from "../../../../types";
import type { AgentTaskStore } from "./types";

function okOf(result: { ok?: boolean } | undefined): boolean {
  return result?.ok !== false;
}

function messageOf(result: { message?: string } | undefined): string | undefined {
  return result?.message;
}

export function createAgentTaskStore(): AgentTaskStore {
  const state = () => useTaskStore.getState();

  return {
    getAllTasks: () => state().allTasks,
    getCategories: () => state().categories.map((category) => ({ id: category.id, name: category.name })),

    async createTask(input: CreateTaskInput) {
      const beforeIds = new Set(state().allTasks.map((task) => task.id));
      const result = await state().createTask(input);
      const directId = (result as { id?: string }).id;
      const createdId = directId ?? state().allTasks.find((task) => !beforeIds.has(task.id))?.id;
      return { ok: okOf(result), id: createdId, message: messageOf(result) };
    },

    async updateTask(id: string, input: UpdateTaskInput) {
      const result = await state().updateTask(id, input);
      return { ok: okOf(result), message: messageOf(result) };
    },

    async deleteTask(id: string) {
      const result = await state().deleteTask(id);
      return { ok: okOf(result), message: messageOf(result) };
    },

    startTask: (id: string) => state().startTask(id),

    async pauseActiveTask() {
      const result = await state().pauseActiveTask();
      return { ok: okOf(result), message: messageOf(result) };
    },

    async completeTask(id: string, note?: string) {
      const result = await state().completeTask(id, note);
      return { ok: okOf(result), message: messageOf(result) };
    },

    async dropTask(id: string) {
      const result = await state().dropTask(id);
      return { ok: okOf(result), message: messageOf(result) };
    },

    async moveTaskToBacklog(id: string) {
      const result = await state().moveTaskToBacklog(id);
      return { ok: okOf(result), message: messageOf(result) };
    },

    ensureCategory: (name: string) => state().ensureCategory(name),
    refresh: () => state().refresh()
  };
}
