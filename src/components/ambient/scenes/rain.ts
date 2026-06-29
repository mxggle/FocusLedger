import { CloudRain } from "lucide-react";
import type { AmbientScene, AmbientSceneDef, ScenePalette, Size } from "./registry";
import { resolveColors } from "./registry";

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  width: number;
}

// Density scales with area so the field looks even on both surfaces.
const DROPS_PER_MEGAPIXEL = 280;

function createRain(palette: ScenePalette): AmbientScene {
  let drops: Drop[] = [];
  let sized = { width: 0, height: 0 };
  let last = 0;

  function reseed(size: Size) {
    const target = Math.round(((size.width * size.height) / 1_000_000) * DROPS_PER_MEGAPIXEL);
    drops = Array.from({ length: Math.max(20, target) }, () => spawn(size, true));
    sized = { width: size.width, height: size.height };
  }

  function spawn(size: Size, anywhere: boolean): Drop {
    return {
      x: Math.random() * size.width,
      y: anywhere ? Math.random() * size.height : -20,
      len: 9 + Math.random() * 16,
      speed: 240 + Math.random() * 280,
      // Wider alpha spread so some drops are delicate filaments, others more solid.
      alpha: 0.12 + Math.random() * 0.32,
      // Thin, with rare slightly thicker drops for depth.
      width: Math.random() < 0.15 ? 1.4 : 0.9
    };
  }

  function wash(ctx: CanvasRenderingContext2D, size: Size, p: ReturnType<typeof resolveColors>) {
    const grad = ctx.createLinearGradient(0, 0, 0, size.height);
    grad.addColorStop(0, withAlpha(p.base, 0.28));
    grad.addColorStop(1, withAlpha(p.mid, 0.38));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  return {
    draw(ctx, t, _dpr, size) {
      const p = resolveColors(palette);
      if (size.width !== sized.width || size.height !== sized.height) reseed(size);
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;

      ctx.clearRect(0, 0, size.width, size.height);
      wash(ctx, size, p);

      // Gentle, slowly-shifting wind shear.
      const skew = Math.sin(t / 5500) * 0.14;

      // Soft glow on all streaks — set once, applied to the whole batch.
      ctx.shadowColor = withAlpha(p.glow, 0.55);
      ctx.shadowBlur = 3;
      ctx.lineCap = "round";

      for (const drop of drops) {
        drop.y += drop.speed * dt;
        drop.x += drop.speed * dt * skew;
        if (drop.y - drop.len > size.height) Object.assign(drop, spawn(size, false));
        ctx.strokeStyle = withAlpha(p.particle, drop.alpha);
        ctx.lineWidth = drop.width;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.len * skew, drop.y - drop.len);
        ctx.stroke();
      }

      // Reset shadow so it doesn't bleed into other canvas operations.
      ctx.shadowBlur = 0;
    },

    reducedFrame(ctx, _dpr, size) {
      const p = resolveColors(palette);
      ctx.clearRect(0, 0, size.width, size.height);
      wash(ctx, size, p);
      ctx.lineCap = "round";
      ctx.lineWidth = 0.9;
      ctx.shadowColor = withAlpha(p.glow, 0.4);
      ctx.shadowBlur = 2;
      ctx.strokeStyle = withAlpha(p.particle, 0.18);
      for (let i = 0; i < 38; i += 1) {
        const x = (i / 38) * size.width + ((i % 3) * 8);
        const y = (i * 57) % size.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.5, y - 13);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  };
}

/** Append `alpha` to an `r g b` triplet stored in the palette. */
function withAlpha(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${alpha.toFixed(3)})`;
}

export const rainScene: AmbientSceneDef = {
  id: "rain",
  label: "Rain",
  icon: CloudRain,
  accent: "213 80% 56%",
  palette: {
    dark: {
      base: "40, 56, 78",
      mid: "24, 34, 52",
      particle: "155, 185, 220",
      glow: "195, 215, 240"
    },
    light: {
      // Cool, misty — barely-there washes, visible-but-delicate streaks.
      base: "210, 225, 245",
      mid: "185, 205, 232",
      particle: "85, 130, 190",
      glow: "130, 165, 215"
    }
  },
  create: createRain
};
