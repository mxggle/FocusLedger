export function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }

  return Math.floor(seconds);
}

export function formatTimer(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
}

/**
 * Timer for tight surfaces like the macOS menu bar: no zero-padded hour block,
 * so the common sub-hour case is "25:34" instead of "00:25:34".
 */
export function formatTimerCompact(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");

  if (hours === 0) {
    return `${minutes}:${remainingSeconds}`;
  }

  return `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
}

export function formatDurationCompact(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  if (safeSeconds === 0) {
    return "0m";
  }

  const totalMinutes = Math.max(1, Math.ceil(safeSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

/**
 * Parse a user-typed estimate (minutes). One rule for every capture surface:
 * anything that isn't a positive finite number means "no estimate".
 */
export function parseEstimateMinutes(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatSignedDurationCompact(seconds: number): string {
  if (seconds === 0) {
    return "0m";
  }

  const prefix = seconds > 0 ? "+" : "-";
  return `${prefix}${formatDurationCompact(Math.abs(seconds))}`;
}
