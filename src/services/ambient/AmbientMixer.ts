import { Howl, Howler } from "howler";
import type { SoundDef } from "./sounds";

/**
 * A small, swappable interface over the audio backend so the orchestration hook
 * never touches Howler directly and the diff logic stays unit-testable against
 * a mock. Each sound is an independently-volumed looping layer; master
 * volume/mute and suspend/resume apply across all of them.
 */
export interface AmbientMixer {
  setLayer(id: string, enabled: boolean, volume: number): void;
  setMaster(volume: number, muted: boolean): void;
  /** Fade everything out but keep loops loaded (e.g. session paused/idle). */
  suspend(): void;
  /** Fade enabled layers back in (session running again). */
  resume(): void;
  dispose(): void;
}

const FADE_MS = 400;

interface Layer {
  def: SoundDef;
  howl: Howl | null;
  enabled: boolean;
  volume: number;
  /** Source missing or failed to load — treated as gracefully unavailable. */
  unavailable: boolean;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Nudge Howler's shared Web Audio context back to `running`. In the Tauri
 * webview the context comes up `suspended` under the autoplay policy, and since
 * we start playback from a state effect (not directly inside the click handler)
 * Howler's auto-unlock doesn't reliably resume it — so buffers would play into a
 * silent context. Safe to call repeatedly; a no-op once running or on HTML5.
 */
function resumeContext(): void {
  try {
    const ctx = Howler.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no Web Audio context (HTML5 fallback) — nothing to resume */
  }
}

/**
 * Real Howler-backed mixer. All Howler calls are guarded: a failure on one
 * layer is logged and that layer is disabled, never blocking the UI or the
 * other layers.
 */
export function createAmbientMixer(sounds: SoundDef[]): AmbientMixer {
  const layers = new Map<string, Layer>();
  for (const def of sounds) {
    layers.set(def.id, { def, howl: null, enabled: false, volume: def.defaultVolume, unavailable: false });
  }
  let suspended = false;
  let disposed = false;

  function ensureHowl(layer: Layer): Howl | null {
    if (layer.howl || layer.unavailable) return layer.howl;
    const src = layer.def.resolveSrc();
    if (!src) {
      layer.unavailable = true;
      return null;
    }
    try {
      layer.howl = new Howl({
        src: [src],
        loop: true,
        volume: 0, // always fade up from silence to avoid clicks
        html5: false,
        onloaderror: (_id, err) => {
          console.warn(`[ambient] failed to load "${layer.def.id}"`, err);
          layer.unavailable = true;
        },
        onplayerror: (_id, err) => {
          console.warn(`[ambient] failed to play "${layer.def.id}"`, err);
        }
      });
    } catch (error) {
      console.warn(`[ambient] could not create "${layer.def.id}"`, error);
      layer.unavailable = true;
      return null;
    }
    return layer.howl;
  }

  function applyLayer(layer: Layer): void {
    if (disposed) return;
    const shouldPlay = layer.enabled && !suspended;

    if (shouldPlay) {
      const howl = ensureHowl(layer);
      if (!howl) return;
      try {
        resumeContext();
        if (!howl.playing()) howl.play();
        howl.fade(howl.volume(), layer.volume, FADE_MS);
      } catch (error) {
        console.warn(`[ambient] play/fade failed for "${layer.def.id}"`, error);
      }
      return;
    }

    const howl = layer.howl;
    if (!howl) return;
    try {
      if (howl.playing()) {
        howl.fade(howl.volume(), 0, FADE_MS);
        // Pause only once silent, and only if it should still be silent — a
        // re-enable mid-fade cancels the pause.
        howl.once("fade", () => {
          if (!(layer.enabled && !suspended)) {
            try {
              howl.pause();
            } catch {
              /* already torn down */
            }
          }
        });
      }
    } catch (error) {
      console.warn(`[ambient] fade-out failed for "${layer.def.id}"`, error);
    }
  }

  return {
    setLayer(id, enabled, volume) {
      const layer = layers.get(id);
      if (!layer) return;
      layer.enabled = enabled;
      layer.volume = clamp01(volume);
      applyLayer(layer);
    },
    setMaster(volume, muted) {
      try {
        Howler.volume(clamp01(volume));
        Howler.mute(muted);
      } catch (error) {
        console.warn("[ambient] master volume/mute failed", error);
      }
    },
    suspend() {
      if (suspended || disposed) return;
      suspended = true;
      for (const layer of layers.values()) applyLayer(layer);
    },
    resume() {
      if (!suspended || disposed) return;
      suspended = false;
      for (const layer of layers.values()) applyLayer(layer);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const layer of layers.values()) {
        try {
          layer.howl?.stop();
          layer.howl?.unload();
        } catch {
          /* best effort */
        }
        layer.howl = null;
      }
      layers.clear();
    }
  };
}
