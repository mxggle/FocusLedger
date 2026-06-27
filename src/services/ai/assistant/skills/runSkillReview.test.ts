import { describe, expect, it, vi } from "vitest";
import { runSkillReview, type SkillReviewDeps } from "./runSkillReview";
import type { AssistantSkill } from "./types";

function skill(overrides: Partial<AssistantSkill> = {}): AssistantSkill {
  return {
    id: "s1",
    name: "Reschedule batch",
    trigger: "when asked to shift many tasks",
    steps: "list_tasks then update_task per task",
    createdAt: "t0",
    updatedAt: "t0",
    useCount: 0,
    lastUsedAt: null,
    pinned: false,
    archived: false,
    ...overrides
  };
}

function depsWith(raw: string, repo: Partial<SkillReviewDeps["repo"]> = {}): { deps: SkillReviewDeps; repo: Required<SkillReviewDeps["repo"]> } {
  const fullRepo = {
    add: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    bumpUsage: vi.fn(async () => {}),
    ...repo
  } as Required<SkillReviewDeps["repo"]>;
  return {
    repo: fullRepo,
    deps: {
      generateChat: vi.fn(async () => raw),
      repo: fullRepo,
      makeId: () => "newid",
      now: () => "t1"
    }
  };
}

describe("runSkillReview", () => {
  it("skips when fewer than 2 tools executed (gate)", async () => {
    const { deps, repo } = depsWith('{"skills":[{"op":"create","name":"X","trigger":"t","steps":"s"}]}');
    await runSkillReview(
      { settings: {} as never, transcript: "t", assistantText: "a", executedToolSummaries: ["one"], existing: [] },
      deps
    );
    expect(deps.generateChat).not.toHaveBeenCalled();
    expect(repo.add).not.toHaveBeenCalled();
  });

  it("creates a new skill from a multi-step turn", async () => {
    const { deps, repo } = depsWith(
      '{"skills":[{"op":"create","name":"Reschedule batch","trigger":"when shifting tasks","steps":"list then update"}]}'
    );
    await runSkillReview(
      {
        settings: {} as never,
        transcript: "t",
        assistantText: "a",
        executedToolSummaries: ["list_tasks: ok", "update_task: ok"],
        existing: []
      },
      deps
    );
    expect(repo.add).toHaveBeenCalledTimes(1);
    expect((repo.add as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ id: "newid", name: "Reschedule batch" });
  });

  it("bumps usage instead of duplicating a same-named skill", async () => {
    const { deps, repo } = depsWith(
      '{"skills":[{"op":"create","name":"Reschedule batch","trigger":"x","steps":"y"}]}'
    );
    await runSkillReview(
      {
        settings: {} as never,
        transcript: "t",
        assistantText: "a",
        executedToolSummaries: ["list_tasks: ok", "update_task: ok"],
        existing: [skill()]
      },
      deps
    );
    expect(repo.add).not.toHaveBeenCalled();
    expect(repo.bumpUsage).toHaveBeenCalledWith("s1", 1, "t1", "t1");
  });

  it("leaves skills untouched when the model returns no ops", async () => {
    const { deps, repo } = depsWith('{"skills":[]}');
    await runSkillReview(
      {
        settings: {} as never,
        transcript: "t",
        assistantText: "a",
        executedToolSummaries: ["a: ok", "b: ok"],
        existing: [skill()]
      },
      deps
    );
    expect(repo.add).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("never throws on a provider error", async () => {
    const repo = { add: vi.fn(), update: vi.fn(), archive: vi.fn(), bumpUsage: vi.fn() } as never;
    const deps: SkillReviewDeps = {
      generateChat: vi.fn(async () => {
        throw new Error("network");
      }),
      repo,
      makeId: () => "x",
      now: () => "t1"
    };
    await expect(
      runSkillReview(
        { settings: {} as never, transcript: "t", assistantText: "a", executedToolSummaries: ["a: ok", "b: ok"], existing: [] },
        deps
      )
    ).resolves.toBeUndefined();
  });
});
