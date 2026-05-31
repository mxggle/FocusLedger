import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tauri SQL capability", () => {
  it("allows database migrations to execute schema statements", () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/capabilities/default.json"), "utf-8")
    ) as { permissions?: string[] };

    expect(capability.permissions).toContain("sql:allow-execute");
  });
});
