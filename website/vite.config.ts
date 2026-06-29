import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone marketing site. Independent of the Tauri app build:
// it has its own root, its own deps, and emits to website/dist.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
  build: { outDir: "dist", sourcemap: false }
});
