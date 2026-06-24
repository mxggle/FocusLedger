import { describe, expect, it } from "vitest";
import { DEFAULT_SOUL, buildSoulBlock } from "./soul";

describe("buildSoulBlock", () => {
  it("uses DEFAULT_SOUL when soul is blank", () => {
    const block = buildSoulBlock("Yolo Assistant", "");
    expect(block).toContain(DEFAULT_SOUL);
  });

  it("uses the custom soul when provided and omits the default", () => {
    const block = buildSoulBlock("Hermes", "## Identity\nI am Hermes.");
    expect(block).toContain("I am Hermes.");
    expect(block).not.toContain(DEFAULT_SOUL);
  });

  it("includes the name in the product preamble", () => {
    expect(buildSoulBlock("Hermes", "")).toContain("Hermes");
  });

  it("falls back to a default name when blank", () => {
    expect(buildSoulBlock("   ", "")).toContain("Yolo Assistant");
  });

  it("always keeps the product grounding (agent: reversible applied immediately, destructive confirmed)", () => {
    const block = buildSoulBlock("X", "## Identity\nDo anything.");
    expect(block.toLowerCase()).toContain("applied immediately");
    expect(block.toLowerCase()).toContain("destructive");
  });

  it("limits task ids to internal tool use instead of user-facing replies", () => {
    const block = buildSoulBlock("Yolo", "");
    expect(block).toContain("Use task ids only inside tool calls");
    expect(block).not.toContain("Reference existing tasks by the id shown");
  });

  it("AI-CTX-07: a custom Soul replaces the default body but keeps the product guardrails", () => {
    const block = buildSoulBlock("Hermes", "## Identity\nI am a blunt coach.");
    expect(block).toContain("I am a blunt coach.");
    expect(block).not.toContain(DEFAULT_SOUL);
    expect(block.toLowerCase()).toContain("applied immediately");
    expect(block.toLowerCase()).toContain("destructive");
    expect(block).toContain("Use task ids only inside tool calls");
    expect(block).toContain("Hermes");
  });
});
