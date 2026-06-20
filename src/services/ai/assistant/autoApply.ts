import { ACTION_REGISTRY } from "./actions";
import type { AssistantTaskStore, ProposedAction } from "./types";

export type AutoApplyResult = {
  actions: ProposedAction[]; // same order, statuses advanced for reversible actions
  appliedCount: number;
  failedCount: number;
  pendingDestructiveCount: number;
};

/**
 * An agent acts on what it can take back, and only asks before what it can't.
 *
 * This executes every reversible (non-destructive) action the moment it is
 * proposed — create, edit, categorize, reschedule, complete, start — so the user
 * never has to click "Apply" on safe changes. Destructive actions (dropping a
 * task) are left `pending` and surface as a confirmation the user approves.
 *
 * Pure orchestration over the action registry: it never throws — a failed action
 * is marked `failed` so one bad change can't sink the rest of the batch.
 */
export async function autoApplyActions(
  actions: ProposedAction[],
  store: AssistantTaskStore
): Promise<AutoApplyResult> {
  let appliedCount = 0;
  let failedCount = 0;
  let pendingDestructiveCount = 0;
  const next: ProposedAction[] = [];

  for (const action of actions) {
    if (action.status !== "pending") {
      next.push(action);
      continue;
    }
    if (action.destructive) {
      pendingDestructiveCount++;
      next.push(action); // wait for explicit confirmation
      continue;
    }

    const descriptor = ACTION_REGISTRY[action.type];
    try {
      const result = await descriptor.execute(action.params, store);
      if (result.ok) {
        appliedCount++;
        next.push({ ...action, status: "applied" });
      } else {
        failedCount++;
        next.push({ ...action, status: "failed", error: result.message });
      }
    } catch (error) {
      failedCount++;
      const message = error instanceof Error ? error.message : "Could not apply this change";
      next.push({ ...action, status: "failed", error: message });
    }
  }

  return { actions: next, appliedCount, failedCount, pendingDestructiveCount };
}
