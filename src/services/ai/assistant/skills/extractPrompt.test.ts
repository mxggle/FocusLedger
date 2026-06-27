import { describe, expect, it } from "vitest";
import { buildSkillExtractionPrompt } from "./extractPrompt";
import type { AssistantSkill } from "./types";

function skill(p: Partial<AssistantSkill> & { id: string; name: string }): AssistantSkill {
  return {
    trigger: "when asked",
    steps: "do the thing",
    createdAt: "x",
    updatedAt: "x",
    useCount: 0,
    lastUsedAt: null,
    pinned: false,
    archived: false,
    ...p
  };
}

describe("buildSkillExtractionPrompt", () => {
  it("instructs strict JSON output with the correct envelope shape", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: delay all my tasks by 30 min\nAssistant: Done.",
      ["list_tasks called", "update_task called x3"]
    );
    expect(prompt).toMatch(/\{\s*"skills"\s*:/i);
    expect(prompt).toMatch(/json/i);
  });

  it("includes the transcript in the prompt", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: reschedule everything\nAssistant: Rescheduled 5 tasks.",
      ["list_tasks called", "update_task x5"]
    );
    expect(prompt).toContain("User: reschedule everything");
    expect(prompt).toContain("Rescheduled 5 tasks");
  });

  it("includes the executed tool summaries", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: plan my morning\nAssistant: Done.",
      ["list_tasks called", "create_task called x2"]
    );
    expect(prompt).toContain("list_tasks called");
    expect(prompt).toContain("create_task called x2");
  });

  it("instructs the model to generalize — instructions do not hard-code task-specific patterns", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: move task abc123 to 3pm\nAssistant: Moved.",
      ["update_task called"]
    );
    expect(prompt).toMatch(/general|reusable|generic|generaliz/i);
    // The instructions section (before the transcript) must warn against embedding specific ids
    const instructionsSection = prompt.split("Conversation transcript:")[0];
    expect(instructionsSection).toMatch(/no specific|not.*specific|generalized|reusable/i);
  });

  it("instructs the model to produce 0–1 skills (not unbounded)", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: do many things\nAssistant: Done.",
      ["tool1", "tool2"]
    );
    expect(prompt).toMatch(/0.?1|zero.?one|at most one|one skill/i);
  });

  it("describes the SkillOp shape (name, trigger, steps) in instructions", () => {
    const prompt = buildSkillExtractionPrompt("User: hi\nAssistant: hi", []);
    expect(prompt).toMatch(/name/i);
    expect(prompt).toMatch(/trigger/i);
    expect(prompt).toMatch(/steps/i);
  });

  it("shows existing skill ids so the model can update/archive instead of duplicating", () => {
    const prompt = buildSkillExtractionPrompt(
      "User: reschedule everything\nAssistant: Done.",
      ["update_task x3"],
      [
        skill({ id: "skill_abc", name: "Bulk reschedule" }),
        skill({ id: "skill_old", name: "Stale one", archived: true })
      ]
    );
    expect(prompt).toContain("skill_abc");
    expect(prompt).toContain("Bulk reschedule");
    // Archived skills are not offered as update/archive targets.
    expect(prompt).not.toContain("skill_old");
  });

  it("states there are no existing skills when none are active", () => {
    const prompt = buildSkillExtractionPrompt("User: hi\nAssistant: hi", []);
    expect(prompt).toMatch(/Existing skills: none/);
  });
});
