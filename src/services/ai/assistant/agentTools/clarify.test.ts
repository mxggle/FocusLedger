import { describe, expect, it } from "vitest";
import { clarifyTool } from "./clarify";

const deps = {} as never;

describe("clarifyTool", () => {
  it("is a non-destructive read tool", () => {
    expect(clarifyTool.category).toBe("read");
    expect(clarifyTool.destructive).toBe(false);
  });

  it("returns the question and options as data", async () => {
    const res = await clarifyTool.execute(
      { question: "Which day did you mean?", options: ["Today", "Tomorrow"] },
      deps
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toBe("Which day did you mean?");
      expect(res.data).toEqual({ question: "Which day did you mean?", options: ["Today", "Tomorrow"] });
    }
  });

  it("defaults options to an empty array", async () => {
    const res = await clarifyTool.execute({ question: "What time?" }, deps);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ question: "What time?", options: [] });
  });

  it("fails on a missing question", async () => {
    const res = await clarifyTool.execute({}, deps);
    expect(res.ok).toBe(false);
  });
});
