import { Bird, Cloud, Droplets, Flame, Waves, Wind, type LucideIcon } from "lucide-react";
import type { AmbientSoundPref } from "../../types/settings";
import { brownNoiseDataUri } from "./noise";

/**
 * One ambient sound layer. Adding a sound = drop a loop in
 * `src/assets/ambient/audio/<id>.webm` and append one entry here; the mixer,
 * the orchestration hook, and the controls UI all iterate this manifest and
 * never name a sound directly.
 */
export interface SoundDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Per-layer default volume, 0..1. */
  defaultVolume: number;
  /**
   * Resolve the playable source lazily (Howler is only created on first enable).
   * Returns a content-hashed Vite URL when the asset file exists, a generated
   * `data:` URI for synthesized layers, or `undefined` when no source is
   * available yet — the mixer treats that layer as gracefully unavailable.
   */
  resolveSrc: () => string | undefined;
}

// Pick up any audio the user has dropped into the assets folder. Missing files
// simply don't appear here, so the build stays green before assets are supplied
// and they are bundled automatically once added.
const fileUrls = import.meta.glob("../../assets/ambient/audio/*.{webm,mp3,ogg}", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

/** Resolve a bundled loop by id, preferring `.webm`, then any other extension. */
function fileSrc(id: string): () => string | undefined {
  return () => {
    const matches = Object.entries(fileUrls).filter(([path]) =>
      /[/]([^/]+)\.[^.]+$/.exec(path)?.[1] === id
    );
    if (matches.length === 0) return undefined;
    const webm = matches.find(([path]) => path.endsWith(".webm"));
    return (webm ?? matches[0])[1];
  };
}

export const SOUNDS: SoundDef[] = [
  { id: "rain", label: "Rain", icon: Droplets, defaultVolume: 0.5, resolveSrc: fileSrc("rain") },
  { id: "fire", label: "Fire", icon: Flame, defaultVolume: 0.45, resolveSrc: fileSrc("fire") },
  { id: "river", label: "River", icon: Waves, defaultVolume: 0.45, resolveSrc: fileSrc("river") },
  { id: "wind", label: "Wind", icon: Wind, defaultVolume: 0.4, resolveSrc: fileSrc("wind") },
  { id: "birds", label: "Birds", icon: Bird, defaultVolume: 0.4, resolveSrc: fileSrc("birds") },
  {
    id: "brown-noise",
    label: "Brown noise",
    icon: Cloud,
    defaultVolume: 0.5,
    // Ships working with no asset file — synthesized on first enable.
    resolveSrc: () => brownNoiseDataUri()
  }
];

const SOUND_IDS = new Set(SOUNDS.map((sound) => sound.id));

/**
 * Default-merge stored layer prefs against the live manifest: unknown/new ids
 * get their manifest default (disabled, `defaultVolume`), removed ids are
 * dropped, and valid stored prefs are preserved with clamped volumes. Pure —
 * adding or removing a sound never corrupts persisted preferences.
 */
export function normalizeAmbientSounds(
  stored: Record<string, AmbientSoundPref> | undefined
): Record<string, AmbientSoundPref> {
  const safe = stored ?? {};
  const result: Record<string, AmbientSoundPref> = {};
  for (const sound of SOUNDS) {
    const pref = safe[sound.id];
    result[sound.id] = {
      enabled: typeof pref?.enabled === "boolean" ? pref.enabled : false,
      volume: clamp01(typeof pref?.volume === "number" ? pref.volume : sound.defaultVolume)
    };
  }
  return result;
}

export function isKnownSound(id: string): boolean {
  return SOUND_IDS.has(id);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
