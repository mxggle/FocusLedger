import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDatabasePath, resolveReadonly } from "../src/config.js";

describe("resolveDatabasePath", () => {
  it("prefers the YOLO_DB_PATH override", () => {
    const resolved = resolveDatabasePath({ env: { YOLO_DB_PATH: "/tmp/custom.db" }, platform: "darwin" });
    expect(resolved).toBe("/tmp/custom.db");
  });

  it("trims whitespace-only overrides and falls back to the default", () => {
    const resolved = resolveDatabasePath({ env: { YOLO_DB_PATH: "   " }, platform: "linux", });
    expect(resolved.endsWith(path.join("com.yolo.desktop", "yolo.db"))).toBe(true);
  });

  it("uses the macOS Application Support location", () => {
    const resolved = resolveDatabasePath({ env: {}, platform: "darwin" });
    expect(resolved).toContain(path.join("Library", "Application Support", "com.yolo.desktop", "yolo.db"));
  });

  it("honours XDG_CONFIG_HOME on linux", () => {
    const resolved = resolveDatabasePath({ env: { XDG_CONFIG_HOME: "/home/u/.config" }, platform: "linux" });
    expect(resolved).toBe(path.join("/home/u/.config", "com.yolo.desktop", "yolo.db"));
  });

  it("uses APPDATA on windows", () => {
    const resolved = resolveDatabasePath({ env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, platform: "win32" });
    expect(resolved).toContain("com.yolo.desktop");
  });
});

describe("resolveReadonly", () => {
  it("defaults to read-write", () => {
    expect(resolveReadonly({})).toBe(false);
  });

  it.each(["1", "true", "TRUE", " yes "])("treats %j as read-only", (value) => {
    expect(resolveReadonly({ YOLO_MCP_READONLY: value })).toBe(true);
  });

  it.each(["0", "false", ""])("treats %j as read-write", (value) => {
    expect(resolveReadonly({ YOLO_MCP_READONLY: value })).toBe(false);
  });
});
