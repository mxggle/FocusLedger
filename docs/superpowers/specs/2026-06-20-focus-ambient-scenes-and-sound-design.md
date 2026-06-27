# Focus Ambient Scenes & Sound — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**Surfaces:** Focus card ([CurrentFocus.tsx](../../../src/components/today/CurrentFocus.tsx)) + full-screen zen ([FocusZenOverlay.tsx](../../../src/components/today/FocusZenOverlay.tsx))

## Goal

Give a running focus session optional ambient atmosphere: a procedural visual
scene (rain, fire pit, river) behind the timer, and an independent sound mixer
that can layer multiple looping ambient tracks (rain, fire, river, wind, birds,
brown noise) with per-layer volume plus a master volume/mute.

Visual scene and sound layers are **independent axes** — any scene can play with
any combination of sounds, or none.

The whole feature is **additive**: with the scene set to `none` and no sounds
enabled (the default), the focus surfaces look and behave exactly as they do
today. Both surfaces already reserve an `aria-hidden` "ambient background layer"
slot ([CurrentFocus.tsx:160](../../../src/components/today/CurrentFocus.tsx),
[FocusZenOverlay.tsx:119](../../../src/components/today/FocusZenOverlay.tsx)); the
scene canvas drops into those slots.

## Core principle: extensible by manifest

Adding a new scene or sound must be **one new file + one registry/manifest line**,
with no edits to the mixer, renderer, UI, or settings logic. The renderer, the
audio service, and the controls UI all consume manifests and never reference
concrete scenes or sounds by name.

## Architecture

### 1. Assets

- Location: `src/assets/ambient/audio/<id>.webm` (with `.mp3` fallback if a
  target webview lacks Opus/WebM — Tauri's WKWebView/WebView2 support WebM Opus,
  so a single `.webm` per sound is the baseline; add `.mp3` only if a gap is
  found during implementation).
- Short **seamless** loops, ~0.3–1 MB each. Target total ≈ 3–5 MB.
- Imported through Vite (`import rainUrl from "..."`) so they are content-hashed
  and bundled. No CDN, works offline.
- Initial set: `rain`, `fire`, `river`, `wind`, `birds`, `brown-noise`.

### 2. State (`src/stores/settingsStore.ts`, persisted)

```ts
ambientScene: SceneId | "none";              // default "none"
ambientSounds: Record<string, {             // keyed by SoundDef.id
  enabled: boolean;
  volume: number;                            // 0..1
}>;
ambientMasterVolume: number;                 // 0..1, default ~0.6
ambientMuted: boolean;                       // default false
```

**Forward-compatible hydration:** on load, default-merge `ambientSounds` against
the current `SOUNDS` manifest — unknown/new ids get defaults, removed ids are
dropped. Adding or removing a sound never corrupts stored preferences.

### 3. Sound manifest — `src/services/ambient/sounds.ts`

```ts
export interface SoundDef {
  id: string;
  label: string;
  src: string;            // Vite-imported url
  icon: LucideIcon;
  defaultVolume: number;  // 0..1
}
export const SOUNDS: SoundDef[] = [rain, fire, river, wind, birds, brownNoise];
```

Adding a sound = import the asset + append one entry. The mixer iterates `SOUNDS`;
the controls panel auto-renders a row per entry.

### 4. Audio engine — `src/services/ambient/AmbientMixer.ts`

- Wraps **Howler.js** (new dependency) behind a small interface so it is
  swappable and unit-testable:
  ```ts
  interface AmbientMixer {
    setLayer(id: string, enabled: boolean, volume: number): void;
    setMaster(volume: number, muted: boolean): void;
    suspend(): void;   // fade all out, keep loaded
    resume(): void;    // fade back in
    dispose(): void;
  }
  ```
- Each sound is a looping Howl with its own volume; master volume + mute applied
  via `Howler.volume` / `Howler.mute`. Enable/disable and pause/resume use short
  fades to avoid clicks.
- Lazy-creates Howls on first enable; Howler handles the autoplay-unlock gesture
  (the user toggling a sound is the gesture).

### 5. Audio orchestration — `useAmbientAudio()` hook

- Subscribes to the ambient settings slice and **diffs** changes into mixer calls
  (the diff logic is the primary unit-test target — pure function over
  `prev`/`next` settings → list of mixer ops).
- Tied to focus-session lifecycle: calls `mixer.suspend()` when there is no
  running session (none focused or paused) and `mixer.resume()` when a session is
  running; `mixer.dispose()` on unmount.
- **Single owner:** mounted exactly once at an app-level/Today-page parent that
  outlives both focus surfaces — NOT inside `CurrentFocus` or `FocusZenOverlay`.
  The zen overlay sits on top of the still-mounted card, so per-surface mounting
  would create two mixers and double the audio. Audio is independent of which
  surface is visible; only the visual `<AmbientScene>` renders per-surface.

### 6. Visual renderer — `src/components/ambient/AmbientScene.tsx`

- A single `<canvas>` filling the ambient slot, driven by one
  `requestAnimationFrame` loop.
- Resolves the active scene from the registry by `ambientScene` id; renders
  nothing (no RAF) when `none`.
- `useReducedMotion`: render a single static `reducedFrame` (or the soft base
  wash) instead of animating.
- Pauses the RAF loop on `document.visibilitychange` (hidden) and when scene is
  `none`; caps devicePixelRatio (≈1.5) for battery; resizes via `ResizeObserver`.
- A scrim (`bg-background/…` gradient) sits above the canvas, below the orb, so
  timer digits stay legible over busy scenes.

### 7. Scene registry — `src/components/ambient/scenes/registry.ts`

```ts
export interface AmbientSceneDef {
  id: string;
  label: string;
  icon: LucideIcon;
  palette: ScenePalette;                       // theme-aware colors
  draw(ctx, t, dpr, size): void;               // one animated frame
  reducedFrame?(ctx, dpr, size): void;         // static fallback
  // suggestedSounds?: string[]  // reserved extension point, unused in v1
}
export const SCENES: AmbientSceneDef[] = [rain, fire, river];
export type SceneId = (typeof SCENES)[number]["id"];
```

Scene implementations live in `scenes/{rain,fire,river}.ts`:
- **rain** — falling-line particle system.
- **fire** — flickering radial glow + rising ember particles.
- **river** — scrolling gradient/caustic shimmer.

Adding a scene = create `scenes/<id>.ts` + append to `SCENES`. The picker, the
renderer, and the settings type all update from the registry.

### 8. Controls UI — `src/components/ambient/AmbientControls.tsx`

- A Radix popover (already a project dependency) triggered by a small "waves"
  icon button placed in the focus-card header and the zen top bar.
- Contents:
  - **Scene selector** — `None` + one option per `SCENES` entry (segmented or
    icon grid).
  - **Sound layers** — one row per `SOUNDS` entry: toggle + volume slider.
  - **Master** — master volume slider + mute toggle.
- framer-motion for the popover transition, consistent with existing motion.

## Data flow

```
settingsStore (persisted ambient slice)
   │
   ├─► useAmbientAudio()  ──diff──►  AmbientMixer (Howler)  ──►  speakers
   │     (single owner, app-level; suspend/resume from session running state)
   │
   ├─► <AmbientScene>  ──registry lookup──►  scene.draw() on RAF canvas
   │     (rendered per visible surface — card and zen)
   │
   └─► <AmbientControls>  ──writes──►  settingsStore
```

## Error handling

- Audio load/play failures are caught per-layer and logged; a failed layer is
  treated as disabled and never blocks the UI or other layers.
- Canvas context unavailable → render nothing (graceful: surfaces fall back to
  today's static wash).
- Hydration of malformed stored ambient settings falls back to defaults via the
  default-merge step.

## Testing

- **Unit (vitest):**
  - `useAmbientAudio` diff function: settings transitions → expected mixer ops
    (enable/disable, volume change, master, suspend/resume) against a mock mixer.
  - settings default-merge: unknown ids added, removed ids dropped, valid prefs
    preserved.
- **Manual:** both surfaces, scene switching, layering multiple sounds, master
  mute, pause/resume fade, reduced-motion (static frame, no RAF), window
  hidden/restored (RAF + audio behavior).
- **Build:** `yarn build` (tsc + vite), `yarn test`.

## Scope guard (YAGNI — explicitly out of v1)

- No scene→sound auto-pairing (the `suggestedSounds` field is reserved but unused).
- No presets/saved mixes.
- No per-scene tunable parameters beyond `palette`.
- No CDN/streamed assets.
- No new dedicated focus route — reuse the existing card + zen surfaces.

## New dependency

- `howler` (+ `@types/howler`). Wrapped behind `AmbientMixer`; ≈9 KB gzipped.
