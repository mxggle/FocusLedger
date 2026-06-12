import os from "node:os";
import path from "node:path";

/**
 * Yolo's Tauri bundle identifier. `tauri-plugin-sql` stores `sqlite:yolo.db`
 * under the platform app-config directory keyed by this identifier.
 */
const APP_IDENTIFIER = "com.yolo.desktop";
const DB_FILENAME = "yolo.db";

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

/**
 * Resolve the path to the live Yolo SQLite database.
 *
 * Order of precedence:
 *  1. `YOLO_DB_PATH` env override (absolute path to a `.db` file)
 *  2. The per-OS Tauri app-config location for `com.yolo.desktop`
 */
export function resolveDatabasePath(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  const override = env.YOLO_DB_PATH?.trim();
  if (override) {
    return override;
  }

  return path.join(appConfigDir(env, platform), APP_IDENTIFIER, DB_FILENAME);
}

/**
 * Whether the server should run in read-only mode (no write tools registered,
 * connection opened read-only). Opt-in via `YOLO_MCP_READONLY=1` for users who
 * want agents to look but not touch.
 */
export function resolveReadonly(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.YOLO_MCP_READONLY?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Mirror Tauri's `AppConfig` base directory per platform so we read the same
 * file the desktop app writes.
 */
function appConfigDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const home = os.homedir();
  switch (platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support");
    case "win32":
      return env.APPDATA ?? path.join(home, "AppData", "Roaming");
    default:
      return env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  }
}
