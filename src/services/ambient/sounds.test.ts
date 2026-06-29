import { describe, expect, it } from "vitest";
import { normalizeAmbientSounds, SOUNDS } from "./sounds";

describe("normalizeAmbientSounds", () => {
  it("returns a pref for every manifest sound and nothing else", () => {
    const result = normalizeAmbientSounds(undefined);
    expect(Object.keys(result).sort()).toEqual(SOUNDS.map((s) => s.id).sort());
  });

  it("defaults unknown/new ids to disabled at their manifest volume", () => {
    const result = normalizeAmbientSounds({});
    for (const sound of SOUNDS) {
      expect(result[sound.id]).toEqual({ enabled: false, volume: sound.defaultVolume });
    }
  });

  it("drops removed/foreign ids from stored prefs", () => {
    const result = normalizeAmbientSounds({
      "no-longer-exists": { enabled: true, volume: 0.9 }
    });
    expect(result["no-longer-exists"]).toBeUndefined();
  });

  it("preserves valid stored prefs", () => {
    const result = normalizeAmbientSounds({ rain: { enabled: true, volume: 0.33 } });
    expect(result.rain).toEqual({ enabled: true, volume: 0.33 });
  });

  it("clamps out-of-range or malformed volumes and coerces bad enabled flags", () => {
    const result = normalizeAmbientSounds({
      rain: { enabled: true, volume: 5 },
      fire: { enabled: true, volume: -2 },
      // @ts-expect-error — exercising malformed persisted data
      river: { enabled: "yes", volume: Number.NaN }
    });
    expect(result.rain.volume).toBe(1);
    expect(result.fire.volume).toBe(0);
    expect(result.river.enabled).toBe(false);
    expect(result.river.volume).toBe(0);
  });
});
