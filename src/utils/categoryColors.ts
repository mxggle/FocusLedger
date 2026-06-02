// Curated swatch palette for categories, in the spirit of Linear / Todoist.
// Custom hex values are still allowed via the color input — these are quick picks.
export const CATEGORY_COLOR_PALETTE = [
  "#71717a", // zinc
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e" // rose
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_PALETTE[11]; // blue

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string): string {
  return value.trim().toLowerCase();
}
