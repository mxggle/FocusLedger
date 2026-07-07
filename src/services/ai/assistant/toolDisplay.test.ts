import { describe, expect, it } from "vitest";
import { describeToolCallForDisplay } from "./toolDisplay";

describe("describeToolCallForDisplay", () => {
  it("shows the exact due-date and status fields on update cards", () => {
    const display = describeToolCallForDisplay("update_task", {
      task_id: "t1",
      due_date: "today",
      status: "todo"
    });
    expect(display.action).toBe("Reschedule");
    expect(display.summary).toContain("due today");
    expect(display.summary).toContain("status todo");
  });
});
