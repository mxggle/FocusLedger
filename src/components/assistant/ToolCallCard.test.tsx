import { describe, expect, it, vi } from "vitest";
import type { ToolCallRecord } from "../../services/ai/assistant/agentTools/types";
import type { Task } from "../../types";
import { ToolCallCard } from "./ToolCallCard";
import { fireClick, render } from "./_render";

const { mockTaskStore } = vi.hoisted(() => ({
  mockTaskStore: { allTasks: [] as Task[] }
}));
vi.mock("../../stores/taskStore", () => ({
  useTaskStore: Object.assign((selector: (s: typeof mockTaskStore) => unknown) => selector(mockTaskStore), {
    getState: () => mockTaskStore
  })
}));

const TASK_ID = "task-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function withTask(title: string): Task {
  return {
    id: TASK_ID,
    title,
    description: null,
    category_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: "2026-06-23",
    template_id: null,
    planned_start_time: "09:00",
    planned_end_time: "09:30",
    sort_order: null,
    created_at: "x",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null
  };
}

function call(overrides: Partial<ToolCallRecord> & { name: string }): ToolCallRecord {
  return {
    id: "tc1",
    args: {},
    category: "write",
    destructive: false,
    summary: "",
    status: "pending",
    ...overrides
  };
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  if (!match) throw new Error(`button "${text}" not found`);
  return match as HTMLButtonElement;
}

function buttonByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === label);
  if (!match) throw new Error(`button aria-label="${label}" not found`);
  return match as HTMLButtonElement;
}

describe("ToolCallCard — AI-UI-10 labels", () => {
  it("update_task shows the action and task title, not the raw tool name or id", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const container = render(
      <ToolCallCard
        call={call({
          name: "update_task",
          args: { task_id: TASK_ID, planned_start_time: "09:30", planned_end_time: "10:00" },
          status: "pending"
        })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Write launch deck");
    expect(container.textContent).toContain("Reschedule");
    expect(container.textContent).not.toContain("update_task");
    expect(container.textContent).not.toContain(TASK_ID);
  });

  it("create_task shows Create plus the new title", () => {
    mockTaskStore.allTasks = [];
    const container = render(
      <ToolCallCard
        call={call({ name: "create_task", args: { title: "Email Ken" }, status: "pending" })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Create");
    expect(container.textContent).toContain("Email Ken");
    expect(container.textContent).not.toContain("create_task");
  });

  it("start_task shows Start plus the task title", () => {
    mockTaskStore.allTasks = [withTask("Demo prep")];
    const container = render(
      <ToolCallCard
        call={call({ name: "start_task", args: { task_id: TASK_ID }, status: "pending" })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Start");
    expect(container.textContent).toContain("Demo prep");
    expect(container.textContent).not.toContain("start_task");
  });

  it("falls back to a humanized action when the task id is unknown, without leaking the id", () => {
    mockTaskStore.allTasks = [];
    const container = render(
      <ToolCallCard
        call={call({
          name: "update_task",
          args: { task_id: "task-unknown" },
          summary: "update_task",
          status: "pending"
        })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).not.toContain("task-unknown");
    expect(container.textContent).not.toContain("update_task");
  });
});

describe("ToolCallCard — AI-UI-11 states", () => {
  it("pending shows Apply and Dismiss and no status badge", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    const container = render(
      <ToolCallCard
        call={call({ name: "update_task", args: { task_id: TASK_ID }, status: "pending" })}
        onApply={onApply}
        onDismiss={onDismiss}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).not.toContain("Done");
    expect(container.textContent).not.toContain("Failed");
    fireClick(buttonByText(container, "Apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    fireClick(buttonByLabel(container, "Dismiss tool call"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("executed shows a Done badge and a Revert action", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const onRevert = vi.fn();
    const container = render(
      <ToolCallCard
        call={call({
          name: "update_task",
          args: { task_id: TASK_ID },
          status: "executed",
          undo: { kind: "restore_task", taskId: TASK_ID, before: { title: "Write launch deck" } as never }
        })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={onRevert}
      />
    );
    expect(container.textContent).toContain("Done");
    fireClick(buttonByLabel(container, "Revert tool call"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="Apply tool call"]')).toBeNull();
  });

  it("failed shows a Failed badge, the error, and a Retry action", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const onApply = vi.fn();
    const container = render(
      <ToolCallCard
        call={call({
          name: "update_task",
          args: { task_id: TASK_ID },
          status: "failed",
          error: "Task was deleted"
        })}
        onApply={onApply}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Failed");
    expect(container.textContent).toContain("Task was deleted");
    fireClick(buttonByText(container, "Retry"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("reverted shows a Reverted badge and an Apply action", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const onApply = vi.fn();
    const container = render(
      <ToolCallCard
        call={call({ name: "update_task", args: { task_id: TASK_ID }, status: "reverted" })}
        onApply={onApply}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Reverted");
    fireClick(buttonByText(container, "Apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("dismissed shows a Dismissed badge and an Apply action", () => {
    mockTaskStore.allTasks = [withTask("Write launch deck")];
    const onApply = vi.fn();
    const container = render(
      <ToolCallCard
        call={call({ name: "update_task", args: { task_id: TASK_ID }, status: "dismissed" })}
        onApply={onApply}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Dismissed");
    fireClick(buttonByText(container, "Apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("destructive drop renders a danger Apply in pending state", () => {
    mockTaskStore.allTasks = [withTask("Old idea")];
    const container = render(
      <ToolCallCard
        call={call({ name: "drop_task", args: { task_id: TASK_ID }, destructive: true, status: "pending" })}
        onApply={() => undefined}
        onDismiss={() => undefined}
        onRevert={() => undefined}
      />
    );
    expect(container.textContent).toContain("Drop");
    expect(container.textContent).toContain("Old idea");
    const apply = buttonByText(container, "Apply");
    expect(apply.className).toContain("bg-destructive");
  });
});
