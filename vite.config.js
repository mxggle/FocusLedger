import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
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
        globals: true
    }
});
