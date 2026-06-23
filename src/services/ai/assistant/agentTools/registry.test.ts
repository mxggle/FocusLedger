import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, renderToolCatalog, toolByName } from "./registry";

describe("agent tool registry", () => {
  it("includes the general write tools and read tools", () => {
    const names = AGENT_TOOLS.map((tool) => tool.name);
    for (const name of ["list_tasks", "update_task", "create_task", "drop_task", "start_task"]) {
      expect(names).toContain(name);
    }
  });

  it("toolByName resolves and renderToolCatalog lists every tool", () => {
    expect(toolByName("update_task")?.name).toBe("update_task");
    const catalog = renderToolCatalog();
    for (const tool of AGENT_TOOLS) {
      expect(catalog).toContain(tool.name);
    }
  });

  it("only drop_task is destructive", () => {
    expect(AGENT_TOOLS.filter((tool) => tool.destructive).map((tool) => tool.name)).toEqual(["drop_task"]);
  });
});
