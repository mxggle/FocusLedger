# Ambient sound loops

Drop seamless looping audio files here, named `<id>.webm` (Opus/WebM — Tauri's
WKWebView/WebView2 support it). Add a `.mp3` fallback only if a target webview
turns out to lack Opus. Files are picked up automatically by `import.meta.glob`
in `src/services/ambient/sounds.ts` — no code change needed — and bundled,
content-hashed, by Vite.

Each loop should be **seamless** (no click at the loop point), ~0.3–1 MB, total
≈ 3–5 MB.

Required ids (one file each):

| id            | file              | status                                   |
| ------------- | ----------------- | ---------------------------------------- |
| `rain`        | `rain.webm`       | needed                                   |
| `fire`        | `fire.webm`       | needed                                   |
| `river`       | `river.webm`      | needed                                   |
| `wind`        | `wind.webm`       | needed                                   |
| `birds`       | `birds.webm`      | needed                                   |
| `brown-noise` | _(none)_          | ships working — synthesized procedurally |

Until a file is present, that layer shows in the mixer but is treated as
gracefully unavailable (it just won't play). `brown-noise` already works with no
file.
