import type { LucideIcon } from "lucide-react";
import { CircleDashed, Clock, Hourglass, Type } from "lucide-react";

/**
 * Selectable focus clock faces. Adding one = implement its face in
 * `FocusClock.tsx` and append it here; the picker and settings derive from
 * this list. Ids are persisted in settings, so never repurpose one.
 */
export type ClockId = "ring" | "countdown" | "dial" | "minimal";

/**
 * How the face wants to be framed by its parent:
 * - `orb`: a square container sized like a dial — the face draws a circle.
 * - `type`: a wide container — the face is typography and wants the room a
 *   dedicated full-screen timer would give it.
 */
export type ClockLayout = "orb" | "type";

export interface ClockDef {
  id: ClockId;
  label: string;
  icon: LucideIcon;
  layout: ClockLayout;
}

export const CLOCKS: ClockDef[] = [
  { id: "ring", label: "Ring", icon: CircleDashed, layout: "orb" },
  { id: "countdown", label: "Countdown", icon: Hourglass, layout: "orb" },
  { id: "dial", label: "Dial", icon: Clock, layout: "orb" },
  { id: "minimal", label: "Minimal", icon: Type, layout: "type" }
];

/** Stored value → known clock id, falling back to the default ring. */
export function normalizeClockId(value: string | undefined): ClockId {
  return CLOCKS.some((clock) => clock.id === value) ? (value as ClockId) : "ring";
}

/** Layout hint for the normalized clock behind a stored setting value. */
export function getClockLayout(value: string | undefined): ClockLayout {
  const id = normalizeClockId(value);
  return CLOCKS.find((clock) => clock.id === id)?.layout ?? "orb";
}
