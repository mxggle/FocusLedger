import { Flame } from "lucide-react";
import type { AmbientScene, AmbientSceneDef, ScenePalette, Size } from "./registry";
import { resolveColors } from "./registry";

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  ttl: number;
}

const EMBERS_PER_MEGAPIXEL = 80;

function createFire(palette: ScenePalette): AmbientScene {
  let embers: Ember[] = [];
  let sized = { width: 0, height: 0 };
  let last = 0;

  function reseed(size: Size) {
    const target = Math.round(((size.width * size.height) / 1_000_000) * EMBERS_PER_MEGAPIXEL);
    embers = Array.from({ length: Math.max(10, target) }, () => spawn(size));
    sized = { width: size.width, height: size.height };
  }

  function spawn(size: Size): Ember {
    const ttl = 1.8 + Math.random() * 2.4;
    return {
      // Spread embers across a wider horizontal and vertical spawn band —
      // avoids the "clump of specks at bottom" look.
      x: size.width * (0.5 + (Math.random() - 0.5) * 0.55),
      y: size.height * (0.72 + Math.random() * 0.18),
      vx: (Math.random() - 0.5) * 18,
      vy: -(24 + Math.random() * 52),
      size: 1.2 + Math.random() * 2.2,
      life: Math.random() * ttl * 0.3, // stagger initial life so they don't all die at once
      ttl
    };
  }

  function drawGlow(
    ctx: CanvasRenderingContext2D,
    t: number,
    size: Size,
    p: ReturnType<typeof resolveColors>,
    isDark: boolean
  ) {
    // Soft flickering hearth: two overlapping radials at slightly different
    // positions create a more organic, breathing fire core.
    const flicker = 0.86 + Math.sin(t / 145) * 0.07 + Math.sin(t / 60) * 0.04;
    const cx = size.width / 2;
    const baseRadius = Math.min(size.width, size.height) * 0.72 * flicker;

    // Primary hearth glow.
    const g1 = ctx.createRadialGradient(cx, size.height * 0.84, 0, cx, size.height * 0.84, baseRadius);
    g1.addColorStop(0, withAlpha(p.glow, (isDark ? 0.55 : 0.42) * flicker));
    g1.addColorStop(0.38, withAlpha(p.mid, isDark ? 0.28 : 0.22));
    g1.addColorStop(1, withAlpha(p.base, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, size.width, size.height);

    // Secondary, slightly offset shimmer for more dimension.
    const shift = Math.sin(t / 800) * size.width * 0.06;
    const g2 = ctx.createRadialGradient(
      cx + shift, size.height * 0.78, 0,
      cx + shift, size.height * 0.78, baseRadius * 0.55
    );
    g2.addColorStop(0, withAlpha(p.mid, isDark ? 0.22 : 0.16));
    g2.addColorStop(1, withAlpha(p.mid, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  return {
    draw(ctx, t, _dpr, size) {
      const p = resolveColors(palette);
      const isDark = document.documentElement.classList.contains("dark");

      if (size.width !== sized.width || size.height !== sized.height) reseed(size);
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;

      ctx.clearRect(0, 0, size.width, size.height);
      ctx.fillStyle = withAlpha(p.base, isDark ? 0.34 : 0.22);
      ctx.fillRect(0, 0, size.width, size.height);
      drawGlow(ctx, t, size, p, isDark);

      // In dark mode, "lighter" blending lets embers add brightness to the dark
      // hearth — classic fire look. In light mode, "source-over" draws warm
      // orange embers over the light wash without washing out to white.
      ctx.globalCompositeOperation = isDark ? "lighter" : "source-over";

      // Soft shadowBlur on embers for light-mode glow; in dark mode "lighter"
      // compositing already creates the brightness buildup effect.
      if (!isDark) {
        ctx.shadowColor = withAlpha(p.glow, 0.6);
        ctx.shadowBlur = 5;
      }

      for (const ember of embers) {
        ember.life += dt;
        ember.x += ember.vx * dt + Math.sin((t / 320) + ember.y * 0.015) * 5 * dt;
        ember.y += ember.vy * dt;
        ember.vy -= 6 * dt; // gentle upward acceleration
        if (ember.life >= ember.ttl || ember.y < size.height * 0.08) {
          Object.assign(ember, spawn(size));
          continue;
        }
        const fade = Math.sin((ember.life / ember.ttl) * Math.PI); // peak in middle
        const alpha = (isDark ? 0.65 : 0.8) * fade;
        ctx.fillStyle = withAlpha(p.particle, alpha);
        ctx.beginPath();
        ctx.arc(ember.x, ember.y, ember.size * (0.7 + fade * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
    },

    reducedFrame(ctx, _dpr, size) {
      const p = resolveColors(palette);
      const isDark = document.documentElement.classList.contains("dark");
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.fillStyle = withAlpha(p.base, isDark ? 0.34 : 0.22);
      ctx.fillRect(0, 0, size.width, size.height);
      drawGlow(ctx, 0, size, p, isDark);
    }
  };
}

function withAlpha(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${alpha.toFixed(3)})`;
}

export const fireScene: AmbientSceneDef = {
  id: "fire",
  label: "Fire",
  icon: Flame,
  accent: "22 90% 50%",
  palette: {
    dark: {
      base: "28, 16, 12",
      mid: "235, 130, 48",
      particle: "255, 172, 85",
      glow: "255, 148, 55"
    },
    light: {
      // Warm candlelight — cream base, amber hearth glow, rich orange embers.
      base: "255, 248, 240",
      mid: "240, 158, 55",
      particle: "210, 98, 22",
      glow: "255, 178, 70"
    }
  },
  create: createFire
};
