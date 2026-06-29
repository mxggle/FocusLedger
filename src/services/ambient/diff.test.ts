import { describe, expect, it } from "vitest";
import { diffAmbientState, type AmbientAudioState } from "./diff";

function state(overrides: Partial<AmbientAudioState> = {}): AmbientAudioState {
  return {
    sounds: { rain: { enabled: false, volume: 0.5 }, fire: { enabled: false, volume: 0.4 } },
    masterVolume: 0.6,
    muted: false,
    running: true,
    ...overrides
  };
}

describe("diffAmbientState", () => {
  it("initial apply emits master then every layer", () => {
    const ops = diffAmbientState(null, state());
    expect(ops[0]).toEqual({ type: "master", volume: 0.6, muted: false });
    expect(ops).toContainEqual({ type: "layer", id: "rain", enabled: false, volume: 0.5 });
    expect(ops).toContainEqual({ type: "layer", id: "fire", enabled: false, volume: 0.4 });
    // running → no suspend
    expect(ops).not.toContainEqual({ type: "suspend" });
  });

  it("initial apply suspends when no session is running, before any layer op", () => {
    const ops = diffAmbientState(null, state({ running: false }));
    const suspendIndex = ops.findIndex((op) => op.type === "suspend");
    const firstLayerIndex = ops.findIndex((op) => op.type === "layer");
    expect(suspendIndex).toBeGreaterThanOrEqual(0);
    expect(suspendIndex).toBeLessThan(firstLayerIndex);
  });

  it("no change emits no ops", () => {
    const prev = state();
    expect(diffAmbientState(prev, state())).toEqual([]);
  });

  it("enabling a single layer emits only that layer op", () => {
    const prev = state();
    const next = state({ sounds: { ...prev.sounds, rain: { enabled: true, volume: 0.5 } } });
    expect(diffAmbientState(prev, next)).toEqual([
      { type: "layer", id: "rain", enabled: true, volume: 0.5 }
    ]);
  });

  it("changing a layer volume emits a layer op", () => {
    const prev = state();
    const next = state({ sounds: { ...prev.sounds, fire: { enabled: false, volume: 0.9 } } });
    expect(diffAmbientState(prev, next)).toEqual([
      { type: "layer", id: "fire", enabled: false, volume: 0.9 }
    ]);
  });

  it("changing master volume or mute emits a master op", () => {
    const prev = state();
    expect(diffAmbientState(prev, state({ masterVolume: 0.2 }))).toEqual([
      { type: "master", volume: 0.2, muted: false }
    ]);
    expect(diffAmbientState(prev, state({ muted: true }))).toEqual([
      { type: "master", volume: 0.6, muted: true }
    ]);
  });

  it("session running → paused emits suspend; paused → running emits resume", () => {
    const running = state({ running: true });
    const paused = state({ running: false });
    expect(diffAmbientState(running, paused)).toEqual([{ type: "suspend" }]);
    expect(diffAmbientState(paused, running)).toEqual([{ type: "resume" }]);
  });

  it("orders master, running transition, then layers together", () => {
    const prev = state({ running: true });
    const next = state({
      running: false,
      masterVolume: 0.3,
      sounds: { rain: { enabled: true, volume: 0.5 }, fire: { enabled: false, volume: 0.4 } }
    });
    const ops = diffAmbientState(prev, next);
    expect(ops).toEqual([
      { type: "master", volume: 0.3, muted: false },
      { type: "suspend" },
      { type: "layer", id: "rain", enabled: true, volume: 0.5 }
    ]);
  });
});
