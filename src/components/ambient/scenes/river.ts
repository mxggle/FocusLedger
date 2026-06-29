import { Waves } from "lucide-react";
import type { AmbientScene, AmbientSceneDef, ScenePalette, Size } from "./registry";
import { resolveColors } from "./registry";

// A calm scrolling water shimmer: stacked sine bands plus sparse caustic
// highlights. Phase is a pure function of time — no per-frame particle state.
function createRiver(palette: ScenePalette): AmbientScene {
  function wash(
    ctx: CanvasRenderingContext2D,
    size: Size,
    p: ReturnType<typeof resolveColors>
  ) {
    const grad = ctx.createLinearGradient(0, 0, 0, size.height);
    grad.addColorStop(0, withAlpha(p.base, 0.36));
    grad.addColorStop(1, withAlpha(p.mid, 0.44));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  function bands(
    ctx: CanvasRenderingContext2D,
    t: number,
    size: Size,
    p: ReturnType<typeof resolveColors>,
    motion: number
  ) {
    const rows = 8;
    ctx.lineCap = "round";

    // Primary wave bands — slow, gentle undulation.
    for (let r = 0; r < rows; r += 1) {
      const baseY = (size.height / (rows + 1)) * (r + 1);
      const speed = (0.35 + (r % 3) * 0.22) * motion;
      const phase = (t / 1000) * speed + r * 1.4;
      const amp = 5 + (r % 2) * 5;
      // Bands closer to the "surface" (top) are subtler; lower bands bolder.
      const alpha = 0.08 + ((rows - r) / rows) * 0.14;
      ctx.lineWidth = 1.2 + (r % 2) * 0.4;
      ctx.strokeStyle = withAlpha(p.glow, alpha);
      ctx.beginPath();
      for (let x = 0; x <= size.width; x += 10) {
        const y =
          baseY +
          Math.sin(x / 65 + phase) * amp +
          Math.sin(x / 24 - phase * 1.6) * (amp * 0.3);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function caustics(
    ctx: CanvasRenderingContext2D,
    t: number,
    size: Size,
    p: ReturnType<typeof resolveColors>,
    motion: number
  ) {
    // Sparse, brief bright specks that simulate sunlight through water.
    // Deterministic from time so no per-frame state needed.
    const count = 18;
    const tSec = (t / 1000) * motion;
    ctx.shadowColor = withAlpha(p.glow, 0.7);
    ctx.shadowBlur = 4;
    for (let i = 0; i < count; i += 1) {
      // Each speck has a unique pseudo-random position that drifts slowly.
      const seed = i * 137.508; // golden angle spread
      const xi = ((seed * 0.613) % 1) * size.width;
      const yi = ((seed * 0.382) % 1) * size.height;
      const drift = Math.sin(tSec * 0.4 + seed) * 14;
      const x = (xi + drift) % size.width;
      const y = yi + Math.cos(tSec * 0.3 + seed * 1.1) * 8;
      // Pulse in and out gently.
      const pulse = (Math.sin(tSec * 1.2 + seed * 0.9) + 1) * 0.5;
      if (pulse < 0.25) continue; // only render when fairly bright
      const alpha = pulse * 0.22;
      ctx.fillStyle = withAlpha(p.glow, alpha);
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  return {
    draw(ctx, t, _dpr, size) {
      const p = resolveColors(palette);
      ctx.clearRect(0, 0, size.width, size.height);
      wash(ctx, size, p);
      bands(ctx, t, size, p, 1);
      caustics(ctx, t, size, p, 1);
    },
    reducedFrame(ctx, _dpr, size) {
      const p = resolveColors(palette);
      ctx.clearRect(0, 0, size.width, size.height);
      wash(ctx, size, p);
      bands(ctx, 0, size, p, 0);
      // No caustics in reduced-motion — static frame only.
    }
  };
}

function withAlpha(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${alpha.toFixed(3)})`;
}

export const riverScene: AmbientSceneDef = {
  id: "river",
  label: "River",
  icon: Waves,
  accent: "187 76% 42%",
  palette: {
    dark: {
      base: "18, 52, 64",
      mid: "12, 38, 52",
      particle: "120, 200, 212",
      glow: "150, 222, 230"
    },
    light: {
      // Sunlit water — cool aqua wash, shimmer bands, bright caustic glints.
      base: "200, 232, 242",
      mid: "172, 215, 228",
      particle: "95, 178, 198",
      glow: "118, 200, 218"
    }
  },
  create: createRiver
};
