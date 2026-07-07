import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { verifyTaskUpdate } from "./taskUpdateVerification";

const task = {
  id: "t1",
  title: "Report",
  due_date: "2026-07-07",
  status: "todo"
} as Task;

describe("verifyTaskUpdate", () => {
  it("accepts refreshed state containing every requested field", () => {
    expect(() => verifyTaskUpdate(task, { due_date: "2026-07-07", status: "todo" })).not.toThrow();
  });

  it("fails closed when a resolved update is absent from refreshed state", () => {
    expect(() => verifyTaskUpdate(task, { due_date: "2026-07-08" })).toThrow(
      "Task update was not persisted for due_date."
    );
  });
});
