import { describe, expect, it } from "vitest";
import { parseMemoryOps } from "./reviewParser";

describe("parseMemoryOps", () => {
  it("parses a clean array of ops", () => {
    const raw = JSON.stringify([
      { op: "add", kind: "preference", text: "Prefers mornings" },
      { op: "archive", id: "m1" }
    ]);
    expect(parseMemoryOps(raw)).toEqual([
      { op: "add", kind: "preference", text: "Prefers mornings" },
      { op: "archive", id: "m1" }
    ]);
  });

  it("tolerates a fenced code block and surrounding prose", () => {
    const raw = "Sure!\n```json\n[{\"op\":\"add\",\"kind\":\"fact\",\"text\":\"Lives in Tokyo\"}]\n```";
    expect(parseMemoryOps(raw)).toEqual([{ op: "add", kind: "fact", text: "Lives in Tokyo" }]);
  });

  it("drops invalid ops but keeps valid ones", () => {
    const raw = JSON.stringify([
      { op: "add", kind: "bogus", text: "x" }, // bad kind
      { op: "add", kind: "context", text: "" }, // empty text
      { op: "update", text: "no id" }, // missing id
      { op: "skip" }, // no-op
      { op: "add", kind: "context", text: "Q3 launch is the priority" } // valid
    ]);
    expect(parseMemoryOps(raw)).toEqual([{ op: "add", kind: "context", text: "Q3 launch is the priority" }]);
  });

  it("returns [] for non-array / unparseable output", () => {
    expect(parseMemoryOps("Nothing to save.")).toEqual([]);
    expect(parseMemoryOps("{}")).toEqual([]);
    expect(parseMemoryOps("")).toEqual([]);
  });
});
