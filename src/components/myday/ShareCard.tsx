import { format } from "date-fns";
import { forwardRef } from "react";
import { topFocusLine } from "../../services/share/shareModel";
import type { DailyDebrief, TimeEntryWithTask, TodayStats } from "../../types";
import { formatDateLabel, parseDateKey } from "../../utils/date";
import { formatDurationCompact, formatSignedDurationCompact } from "../../utils/duration";
import { buildDonutModel, DONUT_CIRCUMFERENCE } from "./donutModel";
import { buildTimelineModel, formatHourMark } from "./timelineLayout";

// Fixed, theme-independent palette so the exported image looks identical
// regardless of the app's light/dark mode.
const INK = "#0f172a";
const SUB = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const TRACK = "#eef2f7";
const ACCENT = "#6366f1";
const CARD_WIDTH = 1080;
const DONUT_RADIUS = DONUT_CIRCUMFERENCE / (2 * Math.PI);

type ShareCardProps = {
  date: string;
  stats: TodayStats;
  entries: TimeEntryWithTask[];
  debrief: DailyDebrief | null;
  now: Date;
};

/**
 * Offscreen, branded report of a single day, sized for sharing. Rendered with
 * inline styles (not theme tokens) so html-to-image captures it faithfully.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { date, stats, entries, debrief, now },
  ref
) {
  const donut = buildDonutModel(stats.categoryStats);
  const timeline = buildTimelineModel(entries, date, now);
  const hasPlan = stats.estimatedSeconds > 0;
  const highlight = topFocusLine(stats);
  const driftColor = stats.driftSeconds > 0 ? "#d97706" : INK;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_WIDTH,
        boxSizing: "border-box",
        padding: "56px 56px 44px",
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        color: INK,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: ACCENT, fontSize: 26 }}>✦</span>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>Yolo</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 15, color: SUB }}>Make your time count</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {format(parseDateKey(date), "EEEE")}
          </div>
          <div style={{ marginTop: 4, fontSize: 15, color: SUB }}>{formatDateLabel(date)}</div>
        </div>
      </div>

      <div style={{ height: 1, background: LINE, margin: "28px 0 32px" }} />

      {/* Hero stats */}
      <div style={{ display: "flex", gap: 24 }}>
        <HeroStat value={formatDurationCompact(stats.totalFocusSeconds)} label="focused" primary />
        <HeroStat
          value={String(stats.completedTaskCount)}
          label={stats.completedTaskCount === 1 ? "task done" : "tasks done"}
          sub={stats.droppedTaskCount > 0 ? `${stats.droppedTaskCount} dropped` : undefined}
        />
        <HeroStat
          value={hasPlan ? formatSignedDurationCompact(stats.driftSeconds) : "—"}
          valueColor={hasPlan ? driftColor : FAINT}
          label={hasPlan ? (stats.driftSeconds >= 0 ? "over plan" : "under plan") : "no plan set"}
        />
      </div>

      {/* Donut + legend */}
      {donut.segments.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 40 }}>
          <div style={{ position: "relative", width: 168, height: 168, flexShrink: 0 }}>
            <svg width="168" height="168" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r={DONUT_RADIUS} fill="none" stroke={TRACK} strokeWidth="5" />
              {donut.segments.map((segment) => (
                <circle
                  key={segment.categoryId}
                  cx="21"
                  cy="21"
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="5"
                  strokeDasharray={segment.dashArray}
                  strokeDashoffset={segment.dashOffset}
                  transform="rotate(-90 21 21)"
                />
              ))}
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700 }}>
                {formatDurationCompact(donut.totalSeconds)}
              </span>
              <span style={{ fontSize: 12, color: FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                total
              </span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            {donut.segments.map((segment) => (
              <div key={segment.categoryId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 6, background: segment.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 18 }}>{segment.categoryName}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>
                    {formatDurationCompact(segment.seconds)}
                  </span>
                  <span style={{ fontSize: 14, color: FAINT }}>{Math.round(segment.pct)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Timeline */}
      {!timeline.empty ? (
        <div style={{ marginTop: 44 }}>
          <SectionLabel>Timeline</SectionLabel>
          <div style={{ position: "relative", height: 56, background: TRACK, borderRadius: 12, overflow: "hidden" }}>
            {timeline.blocks.map((block) => (
              <div
                key={block.id}
                style={{
                  position: "absolute",
                  left: `${block.leftPct}%`,
                  width: `${Math.max(block.widthPct, 1.2)}%`,
                  top: 8,
                  bottom: 8,
                  background: block.color,
                  borderRadius: 6
                }}
              />
            ))}
          </div>
          <div style={{ position: "relative", height: 18, marginTop: 6 }}>
            {timeline.hourMarks.map((hour) => {
              const leftPct = ((hour - timeline.startHour) / (timeline.endHour - timeline.startHour)) * 100;
              return (
                <span
                  key={hour}
                  style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 12, color: FAINT }}
                >
                  {formatHourMark(hour)}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Reflection */}
      {debrief ? (
        <div style={{ marginTop: 44 }}>
          <SectionLabel>Reflection</SectionLabel>
          <Reflection content={debrief.content} />
        </div>
      ) : null}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 44,
          paddingTop: 24,
          borderTop: `1px solid ${LINE}`,
          fontSize: 14,
          color: FAINT
        }}
      >
        <span>{highlight ? `Most time on ${highlight}` : "A day, honestly."}</span>
        <span>
          Made with <span style={{ color: ACCENT, fontWeight: 600 }}>Yolo</span>
        </span>
      </div>
    </div>
  );
});

function HeroStat({
  value,
  label,
  sub,
  primary = false,
  valueColor = INK
}: {
  value: string;
  label: string;
  sub?: string;
  primary?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "#ffffff",
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: "20px 22px"
      }}
    >
      <div style={{ fontSize: primary ? 44 : 38, fontWeight: 700, letterSpacing: "-0.02em", color: valueColor }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 16, color: SUB }}>
        {label}
        {sub ? <span style={{ color: FAINT }}> · {sub}</span> : null}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: SUB,
        marginBottom: 14
      }}
    >
      {children}
    </div>
  );
}

/** Minimal renderer for the debrief's constrained Markdown, inline-styled. */
function Reflection({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("## ")) {
          const [heading, ...rest] = trimmed.split("\n");
          return (
            <div key={index}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: ACCENT
                }}
              >
                {heading.replace(/^##\s+/, "")}
              </div>
              {rest.length > 0 ? (
                <p style={{ margin: "6px 0 0", fontSize: 17, lineHeight: 1.55, color: INK }}>
                  {rest.join(" ")}
                </p>
              ) : null}
            </div>
          );
        }
        return (
          <p key={index} style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: INK }}>
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
