/**
 * Single source of truth for product copy, links, and download targets.
 * Point DOWNLOAD.* at your real release artifacts when you publish.
 */
export const SITE = {
  name: "Yolo",
  tagline: "Make your time count.",
  description:
    "An AI-native desktop productivity app that turns your tasks into honest time records — so you always know where your day actually went.",
  throughline: "Plan the day. Run one focus. Review the truth.",
  version: "0.5.0",
  repo: "https://github.com/mxggle/yolo"
} as const;

/** Download entry points. Swap these for signed installers / a release page. */
export const DOWNLOAD = {
  releases: "https://github.com/mxggle/yolo/releases/latest",
  mac: "https://github.com/mxggle/yolo/releases/latest",
  windows: "https://github.com/mxggle/yolo/releases/latest",
  linux: "https://github.com/mxggle/yolo/releases/latest"
} as const;

export const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Focus", href: "#focus" },
  { label: "AI", href: "#ai" },
  { label: "Developers", href: "#mcp" }
] as const;
