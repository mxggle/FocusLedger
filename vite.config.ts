import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    strictPort: true,
    port: 1420
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "jsdom",
    globals: true,
    // The MCP server is a standalone package with its own deps and test runner.
    exclude: [...configDefaults.exclude, "mcp/**", ".worktrees/**"]
  }
});
