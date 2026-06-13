import { motion } from "framer-motion";
import type { TimeEntryWithTask } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { Panel } from "./Panel";
import { buildTimelineModel, formatHourMark } from "./timelineLayout";

const MIN_BLOCK_WIDTH_PCT = 1.2;

/**
 * Signature module: when you actually focused across the day, drawn as
 * category-colored blocks on an hour axis.
 */
export function DayTimeline({
  entries,
  date,
  now
}: {
  entries: TimeEntryWithTask[];
  date: string;
  now: Date;
}) {
  const model = buildTimelineModel(entries, date, now);

  return (
    <Panel title="Day timeline">
      {model.empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No focus sessions recorded on this day.
        </p>
      ) : (
        <div>
          <div className="relative h-16 overflow-hidden rounded-xl bg-muted/50 ring-1 ring-inset ring-border/60">
            {/* Hour gridlines */}
            {model.hourMarks.map((hour) => {
              const leftPct = ((hour - model.startHour) / (model.endHour - model.startHour)) * 100;
              return (
                <div
                  key={`line-${hour}`}
                  aria-hidden
                  className="absolute top-0 bottom-0 w-px bg-border/50"
                  style={{ left: `${leftPct}%` }}
                />
              );
            })}

            {/* Session blocks */}
            {model.blocks.map((block) => (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  left: `${block.leftPct}%`,
                  width: `${Math.max(block.widthPct, MIN_BLOCK_WIDTH_PCT)}%`,
                  backgroundColor: block.color,
                  transformOrigin: "left"
                }}
                className="group absolute top-2 bottom-2 flex items-center overflow-hidden rounded-md px-2 shadow-sm"
                title={`${block.taskTitle} · ${block.categoryName}\n${block.startLabel}–${block.endLabel} · ${formatDurationCompact(block.durationSeconds)}`}
              >
                <span className="truncate text-[11px] font-medium text-white/95 drop-shadow-sm">
                  {block.taskTitle}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Hour axis */}
          <div className="relative mt-1.5 h-4">
            {model.hourMarks.map((hour) => {
              const leftPct = ((hour - model.startHour) / (model.endHour - model.startHour)) * 100;
              return (
                <span
                  key={`mark-${hour}`}
                  className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ left: `${leftPct}%` }}
                >
                  {formatHourMark(hour)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
