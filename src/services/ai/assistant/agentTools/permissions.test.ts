import { describe, expect, it } from "vitest";
import { needsConfirm } from "./permissions";
import type { AgentTool } from "./types";

const read = { category: "read", destructive: false } as AgentTool;
const write = { category: "write", destructive: false } as AgentTool;
const destructive = { category: "write", destructive: true } as AgentTool;

describe("needsConfirm", () => {
  it("never confirms read tools", () => {
    for (const level of ["plan", "ask", "auto"] as const) {
      expect(needsConfirm(read, level)).toBe(false);
    }
  });

  it("plan and ask defer all writes", () => {
    for (const level of ["plan", "ask"] as const) {
      expect(needsConfirm(write, level)).toBe(true);
      expect(needsConfirm(destructive, level)).toBe(true);
    }
  });

  it("auto executes reversible writes, confirms destructive", () => {
    expect(needsConfirm(write, "auto")).toBe(false);
    expect(needsConfirm(destructive, "auto")).toBe(true);
  });
});
