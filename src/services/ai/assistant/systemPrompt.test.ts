import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: []
};

describe("buildAssistantSystemPrompt", () => {
  it("includes persona, JSON contract, every action name, and the context", () => {
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt).toContain("Yolo");
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"actions"');
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("reschedule_task");
    expect(prompt).toContain("Write report");
    expect(prompt).toContain("2026-06-18");
    expect(prompt).toContain("t1");
  });

  it("notes when there are no tasks", () => {
    const prompt = buildAssistantSystemPrompt({ ...ctx, tasks: [] });
    expect(prompt.toLowerCase()).toContain("no tasks");
  });
});
