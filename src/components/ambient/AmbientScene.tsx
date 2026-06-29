import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { getScene, type AmbientScene as Scene } from "./scenes/registry";

// Cap device pixel ratio for battery — ambient is decorative, not detail work.
const MAX_DPR = 1.5;

// Vignette mask applied to the canvas: fades the scene to transparent at the
// top (blends under the card's header band) and the left/right edges (no
// visible rectangular boundary against the card background).
const CANVAS_MASK =
  "linear-gradient(to bottom, transparent 0%, black 18%, black 88%, transparent 100%), " +
  "linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)";

/**
 * Renders the active procedural scene into the focus surface's ambient slot:
 * one `<canvas>` driven by a single RAF loop, plus a scrim that keeps the timer
 * digits legible over busy scenes. Renders nothing (and runs no RAF) when the
 * scene is `none` or the canvas context is unavailable, so the surfaces fall
 * back to their static wash exactly as before.
 */
export function AmbientScene() {
  const sceneId = useSettingsStore((state) => state.settings.ambientScene);
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const def = getScene(sceneId);

  // Fade in when the scene first mounts or switches — avoids a hard pop.
  const [opacity, setOpacity] = useState(0);
  useEffect(() => {
    if (!def) return;
    setOpacity(0);
    const timer = setTimeout(() => setOpacity(1), 24); // one-two frames, then fade
    return () => clearTimeout(timer);
  }, [def?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!def) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // graceful: surface keeps its static wash

    const scene: Scene = def.create(def.palette);
    let dpr = 1;
    let size = { width: 0, height: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) scene.reducedFrame(ctx, dpr, size);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    if (reduce) {
      scene.reducedFrame(ctx, dpr, size);
      return () => observer.disconnect();
    }

    let raf = 0;
    let running = true;
    const loop = (t: number) => {
      if (!running) return;
      scene.draw(ctx, t, dpr, size);
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [def, reduce]);

  if (!def) return null;

  return (
    // Wrapper handles the fade-in; CSS transition so framer-motion isn't needed here.
    <div
      className="absolute inset-0"
      style={{ opacity, transition: "opacity 0.65s ease-out" }}
    >
      {/* Canvas with a vignette mask — feathers the scene into all four edges so
          there is no hard rectangular boundary against the card or header band. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{
          maskImage: CANVAS_MASK,
          WebkitMaskImage: CANVAS_MASK,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in"
        }}
      />
      {/* Scrim: strong fade at the very top to blend under the card header, barely
          present in the timer zone so the scene shows through, slight floor.
          The heavy 0.5→0.8 radial from v1 is gone — the theme-aware palettes
          handle readability, and the canvas mask handles edge blending. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, " +
            "hsl(var(--background) / 0.42) 0%, " +
            "hsl(var(--background) / 0.06) 26%, " +
            "hsl(var(--background) / 0.03) 58%, " +
            "hsl(var(--background) / 0.18) 100%)"
        }}
      />
    </div>
  );
}
