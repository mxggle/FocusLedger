import { addDays, format, isWithinInterval, parse } from "date-fns";

export const DATE_KEY_FORMAT = "yyyy-MM-dd";

export function toDateKey(date = new Date()): string {
  return format(date, DATE_KEY_FORMAT);
}

export function parseDateKey(dateKey: string): Date {
  return parse(dateKey, DATE_KEY_FORMAT, new Date());
}

export function startOfDateKey(dateKey: string): Date {
  const date = parseDateKey(dateKey);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDateKey(dateKey: string): Date {
  return addDays(startOfDateKey(dateKey), 1);
}

export function isIsoOnDate(iso: string | null, dateKey: string): boolean {
  if (!iso) {
    return false;
  }

  const value = new Date(iso);
  return isWithinInterval(value, {
    start: startOfDateKey(dateKey),
    end: new Date(endOfDateKey(dateKey).getTime() - 1)
  });
}

export function getRecentDateKeys(days: number, endDate = new Date()): string[] {
  const keys: string[] = [];
  const end = startOfDateKey(toDateKey(endDate));

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(toDateKey(addDays(end, -offset)));
  }

  return keys;
}

export function formatDateLabel(dateKey: string): string {
  return format(parseDateKey(dateKey), "EEE, MMM d");
}
