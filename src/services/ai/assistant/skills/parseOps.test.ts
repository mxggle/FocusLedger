import { describe, expect, it } from "vitest";
import { parseSkillOps } from "./parseOps";

describe("parseSkillOps", () => {
  it("parses a clean JSON envelope with a create op", () => {
    const raw = JSON.stringify({
      skills: [
        { op: "create", name: "Delay tasks", trigger: "when asked to reschedule tasks", steps: "1. List\n2. Shift" }
      ]
    });
    expect(parseSkillOps(raw)).toEqual([
      { op: "create", name: "Delay tasks", trigger: "when asked to reschedule tasks", steps: "1. List\n2. Shift" }
    ]);
  });

  it("parses an update op", () => {
    const raw = JSON.stringify({
      skills: [{ op: "update", id: "s1", steps: "updated steps" }]
    });
    expect(parseSkillOps(raw)).toEqual([{ op: "update", id: "s1", steps: "updated steps" }]);
  });

  it("parses an archive op", () => {
    const raw = JSON.stringify({
      skills: [{ op: "archive", id: "s2" }]
    });
    expect(parseSkillOps(raw)).toEqual([{ op: "archive", id: "s2" }]);
  });

  it("tolerates a fenced code block and surrounding prose", () => {
    const inner = JSON.stringify({ skills: [{ op: "create", name: "Batch emails", trigger: "when processing emails", steps: "group and reply" }] });
    const raw = `Sure!\n\`\`\`json\n${inner}\n\`\`\``;
    expect(parseSkillOps(raw)).toEqual([
      { op: "create", name: "Batch emails", trigger: "when processing emails", steps: "group and reply" }
    ]);
  });

  it("drops invalid ops but keeps valid ones", () => {
    const raw = JSON.stringify({
      skills: [
        { op: "create", name: "", trigger: "some trigger", steps: "steps" }, // empty name
        { op: "create", name: "Valid skill", trigger: "", steps: "steps" }, // empty trigger
        { op: "create", name: "Valid skill", trigger: "valid trigger", steps: "" }, // empty steps
        { op: "update", steps: "no id" }, // missing id for update
        { op: "archive" }, // missing id for archive
        { op: "skip" }, // unknown op
        { op: "create", name: "Real skill", trigger: "when bulk-rescheduling", steps: "list → shift → confirm" } // valid
      ]
    });
    expect(parseSkillOps(raw)).toEqual([
      { op: "create", name: "Real skill", trigger: "when bulk-rescheduling", steps: "list → shift → confirm" }
    ]);
  });

  it("returns [] for non-object / unparseable output", () => {
    expect(parseSkillOps("No skill to extract here.")).toEqual([]);
    expect(parseSkillOps("{}")).toEqual([]);
    expect(parseSkillOps("")).toEqual([]);
    expect(parseSkillOps("[{op: create}]")).toEqual([]); // bare JSON syntax error
  });

  it("returns [] when skills array is empty", () => {
    expect(parseSkillOps(JSON.stringify({ skills: [] }))).toEqual([]);
  });

  it("never throws on garbage input", () => {
    expect(() => parseSkillOps("{{{{{{{{")).not.toThrow();
    expect(() => parseSkillOps(null as unknown as string)).not.toThrow();
    expect(() => parseSkillOps(undefined as unknown as string)).not.toThrow();
  });
});
