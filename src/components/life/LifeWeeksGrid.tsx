import { format } from "date-fns";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useMeasure } from "../../hooks/useMeasure";
import type { WeekFocus } from "../../services/lifeService";
import { formatDurationCompact } from "../../utils/duration";
import { WEEKS_PER_YEAR, weekRange } from "../../utils/lifeWeeks";

type LifeWeeksGridProps = {
  birthDate: string;
  lifeExpectancyYears: number;
  weeksLived: number;
  currentWeekIndex: number;
  selectedWeek: number | null;
  focusByWeek: Map<number, WeekFocus>;
  maxFocusSeconds: number;
  onSelectWeek: (index: number) => void;
  onHoverWeek?: (index: number | null) => void;
};

const COLS = WEEKS_PER_YEAR;
const GAP = 3;
const DECADE_GAP = 10; // extra breathing room between decades
const LABEL_GUTTER = 28;
const MIN_CELL = 4;
const FIT_MAX_CELL = 16; // largest cell when fitting the box
const ZOOM_MAX_CELL = 34; // largest cell when zoomed all the way in
const ZOOM_STEP = 1.3;
const HOT_RATIO = 0.62; // weeks at/above this share of the peak "glow"
const MAX_HOT = 80; // cap glowing weeks so the FX layer stays cheap

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Tokens = {
  primary: string;
  muted: string;
  foreground: string;
  border: string;
  mutedFg: string;
};

function readTokens(el: HTMLElement): Tokens {
  const s = getComputedStyle(el);
  const get = (name: string) => s.getPropertyValue(name).trim() || "0 0% 0%";
  return {
    primary: get("--primary"),
    muted: get("--muted"),
    foreground: get("--foreground"),
    border: get("--border"),
    mutedFg: get("--muted-foreground")
  };
}

const hsl = (token: string, alpha = 1) => `hsl(${token} / ${alpha})`;

/** Pre-rendered soft glow sprite (cheap to stamp vs. live shadowBlur). */
function makeGlow(primary: string): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, hsl(primary, 0.95));
    g.addColorStop(0.35, hsl(primary, 0.4));
    g.addColorStop(1, hsl(primary, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

/** Heat alpha for a lived week, scaled by how much focus was logged. */
function livedAlpha(seconds: number, maxSeconds: number): number {
  if (seconds <= 0 || maxSeconds <= 0) return 0.28; // lived, no tracked focus
  const intensity = Math.sqrt(seconds / maxSeconds); // sqrt lifts small weeks
  return 0.55 + 0.45 * intensity;
}

type Layout = {
  cell: number;
  originX: number;
  originY: number;
  contentW: number;
  contentH: number;
};

type Tooltip = { week: number; x: number; y: number; w: number; h: number };

/**
 * "Your life in weeks" rendered on a canvas: one square per week, 52 per row,
 * one row per year. Drawing on canvas (instead of ~4,000 DOM nodes) keeps it
 * smooth while zooming, panning, and hovering. A second FX layer adds a glow +
 * sparkle to your highest-focus weeks, a pulse on the current week, and a hover
 * ring — redrawn per frame but only for a handful of cells.
 */
export function LifeWeeksGrid({
  birthDate,
  lifeExpectancyYears,
  weeksLived,
  currentWeekIndex,
  selectedWeek,
  focusByWeek,
  maxFocusSeconds,
  onSelectWeek,
  onHoverWeek
}: LifeWeeksGridProps) {
  const rows = Math.round(lifeExpectancyYears);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [measureRef, size] = useMeasure<HTMLDivElement>();
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);

  const [zoomPct, setZoomPct] = useState(100);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Highest-focus weeks get the glow/sparkle treatment.
  const hotWeeks = useMemo(() => {
    if (maxFocusSeconds <= 0) return [] as number[];
    const list: Array<{ idx: number; seconds: number }> = [];
    for (const [idx, week] of focusByWeek) {
      if (week.seconds / maxFocusSeconds >= HOT_RATIO) {
        list.push({ idx, seconds: week.seconds });
      }
    }
    list.sort((a, b) => b.seconds - a.seconds);
    return list.slice(0, MAX_HOT).map((w) => w.idx);
  }, [focusByWeek, maxFocusSeconds]);

  // Cell size that makes the whole life fit the box at zoom 1.
  const fitCell = useMemo(() => {
    if (size.height <= 0 || size.width <= 0) return 0;
    const decadeBoundaries = Math.floor((rows - 1) / 10);
    const usableH = size.height - (rows - 1) * GAP - decadeBoundaries * DECADE_GAP - 8;
    const byHeight = usableH / rows;
    const byWidth = (size.width - LABEL_GUTTER - (COLS - 1) * GAP) / COLS;
    return clamp(Math.floor(Math.min(byHeight, byWidth)), MIN_CELL, FIT_MAX_CELL);
  }, [size.height, size.width, rows]);

  const maxZoom = fitCell > 0 ? Math.max(1, ZOOM_MAX_CELL / fitCell) : 1;

  // Live drawing inputs read by the imperative render loop (no React churn).
  const view = useRef({ zoom: 1, ox: 0, oy: 0 });
  const hoverRef = useRef<number | null>(null);
  const baseDirty = useRef(true);
  const tokensRef = useRef<Tokens | null>(null);
  const glowRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    size,
    fitCell,
    rows,
    weeksLived,
    currentWeekIndex,
    selectedWeek,
    focusByWeek,
    maxFocusSeconds,
    hotWeeks,
    reduceMotion
  });
  stateRef.current = {
    size,
    fitCell,
    rows,
    weeksLived,
    currentWeekIndex,
    selectedWeek,
    focusByWeek,
    maxFocusSeconds,
    hotWeeks,
    reduceMotion
  };

  const computeLayout = useCallback((): Layout => {
    const { size: vp, fitCell: fc, rows: r } = stateRef.current;
    const cell = fc > 0 ? clamp(Math.round(fc * view.current.zoom), fc, ZOOM_MAX_CELL) : 0;
    const contentW = LABEL_GUTTER + COLS * cell + (COLS - 1) * GAP;
    const contentH = r * cell + (r - 1) * GAP + Math.floor((r - 1) / 10) * DECADE_GAP;
    let originX: number;
    let originY: number;
    if (contentW <= vp.width) {
      originX = (vp.width - contentW) / 2;
    } else {
      originX = clamp(view.current.ox, vp.width - contentW, 0);
    }
    if (contentH <= vp.height) {
      originY = Math.max(4, (vp.height - contentH) / 2);
    } else {
      originY = clamp(view.current.oy, vp.height - contentH, 0);
    }
    view.current.ox = originX;
    view.current.oy = originY;
    return { cell, originX, originY, contentW, contentH };
  }, []);

  const rowY = (row: number, cell: number) =>
    row * (cell + GAP) + Math.floor(row / 10) * DECADE_GAP;
  const colX = (col: number, cell: number) => LABEL_GUTTER + col * (cell + GAP);

  const hitTest = useCallback(
    (px: number, py: number, layout: Layout): number | null => {
      const { rows: r } = stateRef.current;
      const { cell, originX, originY } = layout;
      if (cell <= 0) return null;
      const localX = px - originX - LABEL_GUTTER;
      if (localX < 0) return null;
      const col = Math.floor(localX / (cell + GAP));
      if (col < 0 || col >= COLS || localX - col * (cell + GAP) > cell) return null;
      for (let row = 0; row < r; row++) {
        const top = originY + rowY(row, cell);
        if (py < top) return null;
        if (py <= top + cell) {
          const index = row * COLS + col;
          return index;
        }
      }
      return null;
    },
    []
  );

  // ── Canvas sizing (DPR-aware) ────────────────────────────────────────────
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [baseRef.current, fxRef.current]) {
      if (!canvas || size.width <= 0) continue;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    baseDirty.current = true;
  }, [size.width, size.height]);

  // ── Theme tokens + glow sprite (rebuild on theme change) ─────────────────
  useEffect(() => {
    const refresh = () => {
      const el = rootRef.current;
      if (!el) return;
      tokensRef.current = readTokens(el);
      glowRef.current = makeGlow(tokensRef.current.primary);
      baseDirty.current = true;
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });
    return () => observer.disconnect();
  }, []);

  // Redraw the base whenever data/layout inputs change.
  useEffect(() => {
    baseDirty.current = true;
  }, [
    fitCell,
    rows,
    weeksLived,
    currentWeekIndex,
    selectedWeek,
    focusByWeek,
    maxFocusSeconds,
    size.width,
    size.height
  ]);

  // ── The render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;

    const drawBase = (layout: Layout) => {
      const canvas = baseRef.current;
      const ctx = canvas?.getContext("2d");
      const tokens = tokensRef.current;
      if (!ctx || !tokens) return;
      const { size: vp, rows: r, weeksLived: lived, currentWeekIndex: cur, selectedWeek: sel, focusByWeek: focus, maxFocusSeconds: maxS } =
        stateRef.current;
      const { cell, originX, originY } = layout;
      ctx.clearRect(0, 0, vp.width, vp.height);
      if (cell <= 0) return;

      const radius = cell <= 6 ? 1 : cell <= 12 ? 2 : 3;
      const firstRow = Math.max(0, Math.floor(-originY / (cell + GAP)) - 1);
      const lastRow = Math.min(r - 1, Math.ceil((vp.height - originY) / (cell + GAP)) + 1);
      const firstCol = Math.max(0, Math.floor((-originX - LABEL_GUTTER) / (cell + GAP)));
      const lastCol = Math.min(COLS - 1, Math.ceil((vp.width - originX - LABEL_GUTTER) / (cell + GAP)));

      ctx.font = `600 ${Math.min(11, Math.max(9, cell))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let row = firstRow; row <= lastRow; row++) {
        const y = originY + rowY(row, cell);
        if (y > vp.height || y + cell < 0) continue;

        if (row % 10 === 0) {
          ctx.fillStyle = hsl(tokens.foreground, 0.55);
          ctx.fillText(String(row), originX + LABEL_GUTTER - 8, y + cell / 2);
        }

        for (let col = firstCol; col <= lastCol; col++) {
          const index = row * COLS + col;
          const x = originX + colX(col, cell);

          if (index === cur) {
            ctx.fillStyle = hsl(tokens.foreground, 0.92);
          } else if (index < lived) {
            ctx.fillStyle = hsl(tokens.primary, livedAlpha(focus.get(index)?.seconds ?? 0, maxS));
          } else {
            ctx.fillStyle = hsl(tokens.muted, 1);
          }
          ctx.beginPath();
          ctx.roundRect(x, y, cell, cell, radius);
          ctx.fill();

          if (index === sel) {
            ctx.strokeStyle = hsl(tokens.foreground, 0.7);
            ctx.lineWidth = Math.max(1, cell * 0.14);
            ctx.beginPath();
            ctx.roundRect(x - 1, y - 1, cell + 2, cell + 2, radius + 1);
            ctx.stroke();
          }
        }
      }
    };

    const drawFx = (layout: Layout, t: number) => {
      const canvas = fxRef.current;
      const ctx = canvas?.getContext("2d");
      const tokens = tokensRef.current;
      const glow = glowRef.current;
      if (!ctx || !tokens) return;
      const { size: vp, currentWeekIndex: cur, hotWeeks: hot, reduceMotion: rm } = stateRef.current;
      const { cell, originX, originY } = layout;
      ctx.clearRect(0, 0, vp.width, vp.height);
      if (cell <= 0) return;
      const radius = cell <= 6 ? 1 : cell <= 12 ? 2 : 3;

      const centerOf = (index: number) => {
        const row = Math.floor(index / COLS);
        const col = index % COLS;
        return {
          x: originX + colX(col, cell) + cell / 2,
          y: originY + rowY(row, cell) + cell / 2,
          left: originX + colX(col, cell),
          top: originY + rowY(row, cell)
        };
      };
      const onScreen = (cx: number, cy: number) =>
        cx > -cell * 4 && cx < vp.width + cell * 4 && cy > -cell * 4 && cy < vp.height + cell * 4;

      // Brighten + glow + sparkle on the highest-focus weeks. Normal blending
      // (not additive) so it stays visible on the light theme's white surface.
      for (const index of hot) {
        const { x: cx, y: cy, left, top } = centerOf(index);
        if (!onScreen(cx, cy)) continue;
        const phase = (index % 17) * 0.37;
        const pulse = rm ? 0.7 : 0.5 + 0.5 * Math.sin(t * 0.0022 + phase);
        const flash = rm ? 0.2 : Math.pow(0.5 + 0.5 * Math.sin(t * 0.0042 + phase), 6);

        // soft halo
        if (glow) {
          const g = cell * (2.6 + 1.4 * pulse);
          ctx.globalAlpha = 0.22 + 0.4 * pulse;
          ctx.drawImage(glow, cx - g / 2, cy - g / 2, g, g);
        }
        // brightened core (lifts these weeks above the heat map)
        const grow = 0.5 + 1.5 * flash;
        ctx.globalAlpha = 0.85 + 0.15 * pulse;
        ctx.fillStyle = hsl(tokens.primary, 1);
        ctx.beginPath();
        ctx.roundRect(left - grow, top - grow, cell + grow * 2, cell + grow * 2, radius + grow);
        ctx.fill();
        // sparkle: a 4-point glint that flashes
        if (flash > 0.04) {
          const r = cell * (0.7 + 1.1 * flash);
          ctx.globalAlpha = Math.min(1, flash * 1.6);
          ctx.fillStyle = hsl(tokens.primary, 1);
          ctx.fillRect(cx - 0.7, cy - r, 1.4, r * 2);
          ctx.fillRect(cx - r, cy - 0.7, r * 2, 1.4);
        }
        ctx.globalAlpha = 1;
      }

      // Current-week pulse: soft glow + breathing ring.
      if (cur >= 0) {
        const { x: cx, y: cy, left, top } = centerOf(cur);
        if (onScreen(cx, cy)) {
          const p = rm ? 0.7 : 0.5 + 0.5 * Math.sin(t * 0.0028);
          if (glow) {
            const g = cell * (3 + 1.4 * p);
            ctx.globalAlpha = 0.25 + 0.4 * p;
            ctx.drawImage(glow, cx - g / 2, cy - g / 2, g, g);
            ctx.globalAlpha = 1;
          }
          const grow = 2 + 2 * p;
          ctx.strokeStyle = hsl(tokens.primary, 0.55 + 0.4 * p);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(left - grow, top - grow, cell + grow * 2, cell + grow * 2, radius + grow);
          ctx.stroke();
        }
      }

      // Hover ring (the "lift").
      const hovered = hoverRef.current;
      if (hovered !== null && hovered !== cur) {
        const { left, top } = centerOf(hovered);
        ctx.strokeStyle = hsl(tokens.foreground, 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(left - 2, top - 2, cell + 4, cell + 4, radius + 1);
        ctx.stroke();
      }
    };

    const frame = (t: number) => {
      const layout = computeLayout();
      if (baseDirty.current) {
        drawBase(layout);
        baseDirty.current = false;
      }
      drawFx(layout, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [computeLayout]);

  // ── Interaction ──────────────────────────────────────────────────────────
  const setZoom = useCallback(
    (next: number, anchorX?: number, anchorY?: number) => {
      const before = computeLayout();
      const ax = anchorX ?? stateRef.current.size.width / 2;
      const ay = anchorY ?? stateRef.current.size.height / 2;
      const gx = ax - before.originX;
      const gy = ay - before.originY;
      view.current.zoom = clamp(next, 1, maxZoom);
      const fc = stateRef.current.fitCell;
      const newCell = fc > 0 ? clamp(Math.round(fc * view.current.zoom), fc, ZOOM_MAX_CELL) : 0;
      const scale = before.cell > 0 ? newCell / before.cell : 1;
      view.current.ox = ax - gx * scale;
      view.current.oy = ay - gy * scale;
      baseDirty.current = true;
      setZoomPct(Math.round((newCell / Math.max(1, fc)) * 100));
    },
    [computeLayout, maxZoom]
  );

  // Re-clamp zoom if a resize lowers the ceiling.
  useEffect(() => {
    if (view.current.zoom > maxZoom) setZoom(maxZoom);
  }, [maxZoom, setZoom]);

  // Wheel: ⌘/Ctrl (or pinch) zooms, plain wheel pans. Native + non-passive.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        setZoom(
          view.current.zoom * Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top
        );
      } else {
        view.current.ox -= event.deltaX;
        view.current.oy -= event.deltaY;
        baseDirty.current = true;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const drag = useRef<{ active: boolean; x: number; y: number; moved: number } | null>(null);
  const tipRaf = useRef<number | null>(null);
  const pendingTip = useRef<Tooltip | null>(null);

  const scheduleTip = useCallback((next: Tooltip | null) => {
    pendingTip.current = next;
    if (tipRaf.current !== null) return;
    tipRaf.current = requestAnimationFrame(() => {
      tipRaf.current = null;
      setTooltip(pendingTip.current);
    });
  }, []);

  const pannable = () => {
    const l = computeLayout();
    return l.contentW > size.width + 0.5 || l.contentH > size.height + 0.5;
  };

  function pointAt(event: React.PointerEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
  }

  function onPointerDown(event: React.PointerEvent) {
    if (!pannable()) return;
    overlayRef.current?.setPointerCapture(event.pointerId);
    drag.current = { active: true, x: event.clientX, y: event.clientY, moved: 0 };
  }

  function onPointerMove(event: React.PointerEvent) {
    const { x, y, rect } = pointAt(event);
    if (drag.current?.active) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      view.current.ox += dx;
      view.current.oy += dy;
      baseDirty.current = true;
      scheduleTip(null);
      return;
    }
    const index = hitTest(x, y, computeLayout());
    if (index !== hoverRef.current) {
      hoverRef.current = index;
      onHoverWeek?.(index);
    }
    scheduleTip(index === null ? null : { week: index, x, y, w: rect.width, h: rect.height });
  }

  function onPointerUp(event: React.PointerEvent) {
    const wasDrag = drag.current?.active && drag.current.moved > 4;
    drag.current = null;
    if (wasDrag) return;
    const { x, y } = pointAt(event);
    const index = hitTest(x, y, computeLayout());
    if (index !== null) onSelectWeek(index);
  }

  function onPointerLeave() {
    if (tipRaf.current !== null) {
      cancelAnimationFrame(tipRaf.current);
      tipRaf.current = null;
    }
    drag.current = null;
    hoverRef.current = null;
    setTooltip(null);
    onHoverWeek?.(null);
  }

  const canPan = pannable();

  return (
    <div ref={rootRef} className="relative h-full w-full">
      <div ref={measureRef} className="absolute inset-0" aria-hidden="true" />
      <canvas ref={baseRef} className="absolute inset-0 z-0" />
      <canvas ref={fxRef} className="pointer-events-none absolute inset-0 z-10" />

      <div
        ref={overlayRef}
        className="absolute inset-0 z-20"
        style={{ cursor: canPan ? (drag.current?.active ? "grabbing" : "grab") : "default", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />

      {/* Zoom controls */}
      {fitCell > 0 ? (
        <div className="absolute right-2 top-2 z-40 flex items-center gap-1 rounded-lg border border-border bg-surface/85 p-1 shadow-card backdrop-blur">
          <ZoomButton
            label="Zoom out"
            disabled={zoomPct <= 101}
            onClick={() => setZoom(view.current.zoom / ZOOM_STEP)}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </ZoomButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            disabled={zoomPct <= 101}
            className="min-w-[3rem] rounded-md px-1 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 disabled:hover:text-muted-foreground"
            title="Reset to fit"
          >
            {zoomPct}%
          </button>
          <ZoomButton
            label="Zoom in"
            disabled={zoomPct >= Math.round(maxZoom * 100) - 1}
            onClick={() => setZoom(view.current.zoom * ZOOM_STEP)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </ZoomButton>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <ZoomButton label="Fit to screen" disabled={zoomPct <= 101} onClick={() => setZoom(1)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ZoomButton>
        </div>
      ) : null}

      {tooltip ? (
        <WeekTip
          tip={tooltip}
          birthDate={birthDate}
          weeksLived={weeksLived}
          currentWeekIndex={currentWeekIndex}
          focusByWeek={focusByWeek}
        />
      ) : null}
    </div>
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function WeekTip({
  tip,
  birthDate,
  weeksLived,
  currentWeekIndex,
  focusByWeek
}: {
  tip: Tooltip;
  birthDate: string;
  weeksLived: number;
  currentWeekIndex: number;
  focusByWeek: Map<number, WeekFocus>;
}) {
  const range = weekRange(birthDate, tip.week);
  if (!range) return null;

  const inclusiveEnd = new Date(range.end.getTime() - 1);
  const isCurrent = tip.week === currentWeekIndex;
  const isPast = !isCurrent && tip.week < weeksLived;
  const focus = focusByWeek.get(tip.week);
  const status = isCurrent ? "This week" : isPast ? "Lived" : "Ahead";

  const flipX = tip.x > tip.w - 190;
  const flipY = tip.y > tip.h - 96;
  const translate = `translate(${flipX ? "calc(-100% - 14px)" : "14px"}, ${
    flipY ? "calc(-100% - 14px)" : "14px"
  })`;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-0 top-0 z-30 w-max max-w-[210px] rounded-lg border border-border bg-surface px-3 py-2 shadow-card"
      style={{ transform: `translate(${tip.x}px, ${tip.y}px) ${translate}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-foreground">{status}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          Wk {tip.week + 1} · age {Math.floor(tip.week / COLS)}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {format(range.start, "MMM d")} – {format(inclusiveEnd, "MMM d, yyyy")}
      </div>
      {focus ? (
        <div className="mt-1.5 flex items-baseline gap-1.5 border-t border-border pt-1.5">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatDurationCompact(focus.seconds)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            focus · {focus.sessions} {focus.sessions === 1 ? "session" : "sessions"}
          </span>
        </div>
      ) : isPast ? (
        <div className="mt-1.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
          No focus tracked
        </div>
      ) : null}
    </div>
  );
}
