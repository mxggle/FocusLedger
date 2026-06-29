import { useEffect, useRef } from "react";
import { createAmbientMixer, type AmbientMixer } from "../services/ambient/AmbientMixer";
import { diffAmbientState, type AmbientAudioState, type MixerOp } from "../services/ambient/diff";
import { normalizeAmbientSounds, SOUNDS } from "../services/ambient/sounds";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";

function applyOps(mixer: AmbientMixer, ops: MixerOp[]): void {
  for (const op of ops) {
    switch (op.type) {
      case "master":
        mixer.setMaster(op.volume, op.muted);
        break;
      case "layer":
        mixer.setLayer(op.id, op.enabled, op.volume);
        break;
      case "suspend":
        mixer.suspend();
        break;
      case "resume":
        mixer.resume();
        break;
    }
  }
}

/**
 * Single owner of the ambient audio mixer. Mount this exactly once at an
 * app-level parent that outlives both focus surfaces — NOT inside CurrentFocus
 * or FocusZenOverlay, since the zen overlay sits on top of the still-mounted
 * card and per-surface mounting would create two mixers and double the audio.
 *
 * It subscribes to the persisted ambient slice plus the focus-session running
 * state, diffs every change into mixer ops (the pure `diffAmbientState`), and
 * suspends/resumes with the session.
 */
export function useAmbientAudio(): void {
  const ambientSounds = useSettingsStore((state) => state.settings.ambientSounds);
  const masterVolume = useSettingsStore((state) => state.settings.ambientMasterVolume);
  const muted = useSettingsStore((state) => state.settings.ambientMuted);
  const running = useTaskStore((state) =>
    Boolean(
      state.focusedTask &&
        state.activeEntry &&
        state.activeEntry.task_id === state.focusedTask.id
    )
  );

  const mixerRef = useRef<AmbientMixer | null>(null);
  const prevRef = useRef<AmbientAudioState | null>(null);

  useEffect(() => {
    mixerRef.current = createAmbientMixer(SOUNDS);
    return () => {
      mixerRef.current?.dispose();
      mixerRef.current = null;
      prevRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    const next: AmbientAudioState = {
      sounds: normalizeAmbientSounds(ambientSounds),
      masterVolume,
      muted,
      running
    };
    applyOps(mixer, diffAmbientState(prevRef.current, next));
    prevRef.current = next;
  }, [ambientSounds, masterVolume, muted, running]);
}
