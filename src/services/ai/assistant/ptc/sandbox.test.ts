import { describe, expect, it } from "vitest";
import { runProgram } from "./sandbox";
import type { HostTool } from "./types";

// ---------------------------------------------------------------------------
// Fake tools
// ---------------------------------------------------------------------------

function echoTool(name = "echo"): HostTool {
  return {
    name,
    execute: async (args: unknown) => ({ echoed: args }),
  };
}

function counterTool(): { tool: HostTool; count: () => number } {
  let n = 0;
  return {
    tool: {
      name: "tick",
      execute: async () => {
        n += 1;
        return { n };
      },
    },
    count: () => n,
  };
}

function rejectingTool(): HostTool {
  return {
    name: "boom",
    execute: async () => {
      throw new Error("host tool failed");
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runProgram — basic call + return value", () => {
  it("calls a read tool and returns a computed value", async () => {
    const result = await runProgram(
      `
      const r = await echo({ hello: "world" });
      return r.echoed.hello + "!";
      `,
      { tools: [echoTool("echo")], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(true);
    expect(result.returnValue).toBe("world!");
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ name: "echo", args: { hello: "world" } });
    expect(result.calls[0].result).toMatchObject({ echoed: { hello: "world" } });
    expect(result.error).toBeUndefined();
  });
});

describe("runProgram — loop records all calls", () => {
  it("loops N times and records N call entries", async () => {
    const { tool, count } = counterTool();
    const result = await runProgram(
      `
      for (let i = 0; i < 5; i++) {
        await tick();
      }
      return "done";
      `,
      { tools: [tool], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(true);
    expect(result.returnValue).toBe("done");
    expect(result.calls).toHaveLength(5);
    expect(count()).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(result.calls[i].name).toBe("tick");
    }
  });
});

describe("runProgram — log()", () => {
  it("captures log lines", async () => {
    const result = await runProgram(
      `
      log("hello", 42);
      log("world");
      return null;
      `,
      { tools: [], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(true);
    expect(result.logs).toContain("hello 42");
    expect(result.logs).toContain("world");
  });
});

describe("runProgram — timeout", () => {
  it("returns ok:false with a timeout error and does not hang", async () => {
    const result = await runProgram(
      `while (true) {}`,
      { tools: [], timeoutMs: 200 }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout|interrupt/i);
  }, 5000);
});

describe("runProgram — pre-aborted signal", () => {
  it("returns ok:false immediately without calling any tools", async () => {
    const { tool, count } = counterTool();
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await runProgram(
      `
      await tick();
      return "never";
      `,
      { tools: [tool], signal: ctrl.signal, timeoutMs: 3000 }
    );
    expect(result.ok).toBe(false);
    expect(result.calls).toHaveLength(0);
    expect(count()).toBe(0);
  });
});

describe("runProgram — maxCalls cap", () => {
  it("returns ok:false with an error mentioning the cap when exceeded", async () => {
    const { tool } = counterTool();
    const result = await runProgram(
      `
      for (let i = 0; i < 20; i++) {
        await tick();
      }
      return "done";
      `,
      { tools: [tool], maxCalls: 3, timeoutMs: 3000 }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/max.*call|call.*limit|cap/i);
    // At most maxCalls calls should have been recorded before the cap was hit
    expect(result.calls.length).toBeLessThanOrEqual(4);
  });
});

describe("runProgram — syntax error", () => {
  it("returns ok:false, never throws to caller", async () => {
    const result = await runProgram(
      `this is not valid javascript !!!`,
      { tools: [], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

describe("runProgram — thrown error inside code", () => {
  it("returns ok:false, never throws to caller", async () => {
    const result = await runProgram(
      `throw new Error("intentional failure");`,
      { tools: [], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/intentional failure/);
  });
});

describe("runProgram — rejecting host tool", () => {
  it("surfaces as a call error the program can catch without crashing", async () => {
    const result = await runProgram(
      `
      let caught = "";
      try {
        await boom();
      } catch (e) {
        caught = e.message;
      }
      return caught;
      `,
      { tools: [rejectingTool()], timeoutMs: 3000 }
    );
    expect(result.ok).toBe(true);
    expect(result.returnValue).toMatch(/host tool failed/);
    // The call should still be recorded (with error field)
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].error).toMatch(/host tool failed/);
  });
});
