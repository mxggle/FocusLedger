import { useCallback, useState } from "react";
import {
  BACKLOG_GROUPINGS,
  BACKLOG_SCOPES,
  BACKLOG_SORTS,
  BACKLOG_VIEW_MODES,
  type BacklogGroupBy,
  type BacklogScope,
  type BacklogSortBy,
  type BacklogViewMode
} from "../../utils/backlogView";

export type BacklogViewPrefs = {
  scope: BacklogScope;
  viewMode: BacklogViewMode;
  groupBy: BacklogGroupBy;
  sortBy: BacklogSortBy;
};

const STORAGE_KEY = "yolo.backlog.viewPrefs";

const DEFAULT_PREFS: BacklogViewPrefs = {
  scope: "all",
  viewMode: "cards",
  groupBy: "none",
  sortBy: "priority"
};

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function loadPrefs(): BacklogViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    const source = (parsed ?? {}) as Record<string, unknown>;
    return {
      scope: pick(source.scope, BACKLOG_SCOPES, DEFAULT_PREFS.scope),
      viewMode: pick(source.viewMode, BACKLOG_VIEW_MODES, DEFAULT_PREFS.viewMode),
      groupBy: pick(source.groupBy, BACKLOG_GROUPINGS, DEFAULT_PREFS.groupBy),
      sortBy: pick(source.sortBy, BACKLOG_SORTS, DEFAULT_PREFS.sortBy)
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Backlog view preferences (scope tab, card/list density, grouping, sort)
 * persisted to localStorage so the page reopens the way it was left.
 * Text/category/priority filters are intentionally session-only.
 */
export function useBacklogViewPrefs() {
  const [prefs, setPrefs] = useState<BacklogViewPrefs>(loadPrefs);

  const updatePrefs = useCallback((patch: Partial<BacklogViewPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Persistence is best-effort; the in-memory state still updates.
      }
      return next;
    });
  }, []);

  return { prefs, updatePrefs };
}
