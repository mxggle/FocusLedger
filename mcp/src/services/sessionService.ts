import type { SqliteDatabase } from "../db/database.js";
import type { TimeEntryRow } from "../db/types.js";
import type { TaskRepository } from "../repositories/taskRepository.js";
import {
  hasReflection,
  type Reflection,
  type TimeEntryRepository
} from "../repositories/timeEntryRepository.js";
import { createId } from "../util/id.js";

/**
 * Focus-session business rules, mirroring the desktop app's `taskStore`:
 * one active session at a time, auto-pause on switch, a continuation window
 * that merges a quick pause/resume into one block, and discarding closed
 * blocks too short to carry signal. Each operation runs in a transaction so
 * an agent call can never leave the database half-switched.
 */

// Resuming the same task within this gap continues the previous block instead
// of opening a new row. Keeps rapid pause/resume from fragmenting the log.
const CONTINUATION_WINDOW_SECONDS = 180;
// Closed blocks shorter than this carry no useful signal; pausing discards them
// so frequent start/pause calls don't litter the Today Log with empty entries.
const MIN_MEANINGFUL_SECONDS = 30;

export interface StartResult {
  entry: TimeEntryRow;
  /** Set when another task was running and got auto-paused. */
  pausedTaskId: string | null;
  /** True when the previous block was reopened instead of creating a new one. */
  resumedPreviousBlock: boolean;
}

export interface PauseResult {
  /** Null when nothing was running. */
  pausedTaskId: string | null;
  /** True when the closed block was too short to keep and was deleted. */
  entryDiscarded: boolean;
}

export interface FinishResult {
  /** The entry that was closed (or annotated), if any. */
  entry: TimeEntryRow | null;
}

export interface SessionService {
  start(taskId: string): StartResult;
  pauseActive(): PauseResult;
  complete(taskId: string, reflection?: Reflection): FinishResult;
  drop(taskId: string, reflection?: Reflection): FinishResult;
}

interface Deps {
  db: SqliteDatabase;
  tasks: TaskRepository;
  timeEntries: TimeEntryRepository;
}

export function createSessionService({ db, tasks, timeEntries }: Deps): SessionService {
  function newEntry(taskId: string, nowIso: string): TimeEntryRow {
    const entry: TimeEntryRow = {
      id: createId("entry"),
      task_id: taskId,
      start_at: nowIso,
      end_at: null,
      duration_seconds: null,
      note: null,
      blocker: null,
      next_action: null,
      completion_rate: null,
      created_at: nowIso,
      updated_at: nowIso
    };
    timeEntries.insert(entry);
    return entry;
  }

  /** Reopen the just-paused block when the same task restarts within the window. */
  function resumeOrCreateEntry(taskId: string, nowIso: string): { entry: TimeEntryRow; resumed: boolean } {
    const latest = timeEntries.getLatest();
    if (
      latest &&
      latest.task_id === taskId &&
      latest.end_at &&
      !hasReflection(latest) &&
      secondsBetween(latest.end_at, nowIso) <= CONTINUATION_WINDOW_SECONDS
    ) {
      return { entry: timeEntries.reopen(latest.id, nowIso), resumed: true };
    }
    return { entry: newEntry(taskId, nowIso), resumed: false };
  }

  /** Close an open entry; delete it when it captured nothing worth keeping. */
  function closeAndMaybeDiscard(entryId: string, nowIso: string): boolean {
    const closed = timeEntries.close(entryId, nowIso);
    if ((closed.duration_seconds ?? 0) >= MIN_MEANINGFUL_SECONDS || hasReflection(closed)) {
      return false;
    }
    timeEntries.delete(closed.id);
    return true;
  }

  return {
    start(taskId) {
      return db.transaction(() => {
        const nowIso = new Date().toISOString();
        const active = timeEntries.getActive();
        let pausedTaskId: string | null = null;

        if (active && active.task_id !== taskId) {
          // Auto-pause whatever is currently running, then start the new task.
          closeAndMaybeDiscard(active.id, nowIso);
          tasks.update(active.task_id, { status: "paused" });
          pausedTaskId = active.task_id;
        }

        let entry: TimeEntryRow;
        let resumedPreviousBlock = false;
        if (active && active.task_id === taskId) {
          entry = active;
        } else {
          ({ entry, resumed: resumedPreviousBlock } = resumeOrCreateEntry(taskId, nowIso));
        }

        tasks.update(taskId, { status: "doing" });
        return { entry, pausedTaskId, resumedPreviousBlock };
      })();
    },

    pauseActive() {
      return db.transaction(() => {
        const nowIso = new Date().toISOString();
        const active = timeEntries.getActive();
        if (!active) {
          return { pausedTaskId: null, entryDiscarded: false };
        }
        const entryDiscarded = closeAndMaybeDiscard(active.id, nowIso);
        tasks.update(active.task_id, { status: "paused" });
        return { pausedTaskId: active.task_id, entryDiscarded };
      })();
    },

    complete(taskId, reflection = {}) {
      return db.transaction(() => {
        const nowIso = new Date().toISOString();
        const entry = finishSession(timeEntries, taskId, nowIso, {
          ...reflection,
          // Completing while the session runs implies the work got done.
          completion_rate: reflection.completion_rate ?? 100
        });
        tasks.update(taskId, { status: "done", completed_at: nowIso, dropped_at: null });
        return { entry };
      })();
    },

    drop(taskId, reflection = {}) {
      return db.transaction(() => {
        const nowIso = new Date().toISOString();
        const entry = finishSession(timeEntries, taskId, nowIso, reflection);
        tasks.update(taskId, { status: "dropped", completed_at: null, dropped_at: nowIso });
        return { entry };
      })();
    }
  };
}

/**
 * Wrap up tracking for a finishing task: close its running entry with the
 * reflection, or — when it was already paused — attach the reflection to its
 * most recent block (the app's "stop a paused focus" behaviour).
 */
function finishSession(
  timeEntries: TimeEntryRepository,
  taskId: string,
  nowIso: string,
  reflection: Reflection
): TimeEntryRow | null {
  const active = timeEntries.getActive();
  if (active?.task_id === taskId) {
    return timeEntries.close(active.id, nowIso, reflection);
  }

  if (reflection.note || reflection.blocker || reflection.next_action || reflection.completion_rate != null) {
    const entries = timeEntries.listForTask(taskId);
    const latest = entries[entries.length - 1];
    if (latest) {
      return timeEntries.applyReflection(latest.id, reflection);
    }
  }
  return null;
}

function secondsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
}
