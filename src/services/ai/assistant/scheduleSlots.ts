/** A free gap in the day, in minutes-since-midnight. */
export type FreeSlot = { startMin: number; endMin: number; minutes: number };

/** Minutes-since-midnight → "HH:mm". */
export function minutesToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute the open gaps of at least `minDuration` minutes inside
 * [windowStart, windowEnd], given busy intervals. Pure: merges overlapping busy
 * blocks, then returns the gaps. All math in TS so the model only narrates.
 */
export function computeFreeSlots(
  busy: { start: number; end: number }[],
  windowStart: number,
  windowEnd: number,
  minDuration: number
): FreeSlot[] {
  if (windowStart >= windowEnd) return [];

  // Clip to the window and drop empty/inverted intervals.
  const clipped = busy
    .map((b) => ({ start: Math.max(b.start, windowStart), end: Math.min(b.end, windowEnd) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  // Merge overlaps so adjacent meetings don't create phantom gaps.
  const merged: { start: number; end: number }[] = [];
  for (const block of clipped) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end);
    } else {
      merged.push({ ...block });
    }
  }

  const slots: FreeSlot[] = [];
  let cursor = windowStart;
  for (const block of merged) {
    if (block.start - cursor >= minDuration) {
      slots.push({ startMin: cursor, endMin: block.start, minutes: block.start - cursor });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (windowEnd - cursor >= minDuration) {
    slots.push({ startMin: cursor, endMin: windowEnd, minutes: windowEnd - cursor });
  }
  return slots;
}
