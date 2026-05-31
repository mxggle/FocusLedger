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

export function formatSignedDurationCompact(seconds: number): string {
  if (seconds === 0) {
    return "0m";
  }

  const prefix = seconds > 0 ? "+" : "-";
  return `${prefix}${formatDurationCompact(Math.abs(seconds))}`;
}
