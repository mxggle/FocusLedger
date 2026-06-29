import type { AmbientSoundPref } from "../../types/settings";

/**
 * The minimal audio-relevant snapshot the orchestration hook diffs. Visual
 * scene selection is deliberately absent — it is an independent axis handled by
 * the canvas renderer, not the mixer.
 */
export interface AmbientAudioState {
  /** Normalized per-layer prefs (already merged against the SOUNDS manifest). */
  sounds: Record<string, AmbientSoundPref>;
  masterVolume: number;
  muted: boolean;
  /** Whether a focus session is currently running (not paused / not idle). */
  running: boolean;
}

export type MixerOp =
  | { type: "master"; volume: number; muted: boolean }
  | { type: "layer"; id: string; enabled: boolean; volume: number }
  | { type: "suspend" }
  | { type: "resume" };

/**
 * Pure transition → mixer-ops. The single source of truth for what the audio
 * engine should do; the React hook is a thin shell that feeds state in and
 * applies the ops out. `prev === null` is the initial apply.
 *
 * Order matters: master, then the running transition (so an initial `suspend`
 * lands before layer ops and they never briefly play), then per-layer changes.
 */
export function diffAmbientState(
  prev: AmbientAudioState | null,
  next: AmbientAudioState
): MixerOp[] {
  const ops: MixerOp[] = [];

  if (!prev || prev.masterVolume !== next.masterVolume || prev.muted !== next.muted) {
    ops.push({ type: "master", volume: next.masterVolume, muted: next.muted });
  }

  if (!prev) {
    if (!next.running) ops.push({ type: "suspend" });
  } else if (prev.running !== next.running) {
    ops.push(next.running ? { type: "resume" } : { type: "suspend" });
  }

  for (const [id, pref] of Object.entries(next.sounds)) {
    const before = prev?.sounds[id];
    if (!before || before.enabled !== pref.enabled || before.volume !== pref.volume) {
      ops.push({ type: "layer", id, enabled: pref.enabled, volume: pref.volume });
    }
  }

  return ops;
}
