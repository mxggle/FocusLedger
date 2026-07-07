var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
var pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    server: {
        strictPort: true,
        port: 1421
    },
    envPrefix: ["VITE_", "TAURI_"],
    test: {
        environment: "jsdom",
        globals: true,
        // The MCP server is a standalone package with its own deps and test runner.
        exclude: __spreadArray(__spreadArray([], configDefaults.exclude, true), ["mcp/**", ".worktrees/**"], false)
    }
});
