var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: {
        strictPort: true,
        port: 1420
    },
    envPrefix: ["VITE_", "TAURI_"],
    test: {
        environment: "jsdom",
        globals: true,
        // The MCP server is a standalone package with its own deps and test runner.
        exclude: __spreadArray(__spreadArray([], configDefaults.exclude, true), ["mcp/**"], false)
    }
});
