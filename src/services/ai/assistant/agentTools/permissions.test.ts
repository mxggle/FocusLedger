import { describe, expect, it } from "vitest";
import { isDestructive, needsConfirm } from "./permissions";
import type { AgentTool } from "./types";

const read = { category: "read", destructive: false } as AgentTool;
const write = { category: "write", destructive: false } as AgentTool;
const destructive = { category: "write", destructive: true } as AgentTool;
// A tool whose risk depends on its args, e.g. update_task with status→dropped.
const conditional = {
  category: "write",
  destructive: false,
  destructiveFor: (args: unknown) => (args as { status?: string })?.status === "dropped"
} as AgentTool;

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

  it("auto confirms a conditionally-destructive call only for the risky args", () => {
    expect(needsConfirm(conditional, "auto", { status: "doing" })).toBe(false);
    expect(needsConfirm(conditional, "auto", { status: "dropped" })).toBe(true);
  });

  it("plan/ask still defer conditionally-destructive writes regardless of args", () => {
    expect(needsConfirm(conditional, "ask", { status: "doing" })).toBe(true);
    expect(needsConfirm(conditional, "plan", { status: "dropped" })).toBe(true);
  });

  it("isDestructive honors the per-call override and falls back to the static flag", () => {
    expect(isDestructive(write, {})).toBe(false);
    expect(isDestructive(destructive, {})).toBe(true);
    expect(isDestructive(conditional, { status: "dropped" })).toBe(true);
    expect(isDestructive(conditional, { status: "todo" })).toBe(false);
  });
});
