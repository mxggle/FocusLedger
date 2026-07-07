import { AnimatePresence } from "framer-motion";
import type { BacklogGroup } from "../../utils/backlogView";
import { AnimatedListItem } from "../ui/AnimatedListItem";
import { CategoryDot } from "../ui/CategoryDot";
import { BacklogTaskItem } from "./BacklogTaskItem";

/**
 * Kanban-style columns, one per group. The page falls back to priority
 * grouping when "Group: None" is selected so the board always has columns.
 */
export function BacklogBoard({ groups }: { groups: BacklogGroup[] }) {
  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-4">
      {groups.map((group) => (
        <section
          key={group.key}
          className="w-[300px] shrink-0 rounded-xl border border-border bg-muted/40 p-2.5"
        >
          <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
            {group.color !== undefined ? (
              <CategoryDot color={group.color} />
            ) : null}
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {group.tasks.length}
            </span>
          </div>

          <div className="grid gap-2">
            <AnimatePresence initial={false}>
              {group.tasks.map((task) => (
                <AnimatedListItem key={task.id}>
                  <BacklogTaskItem task={task} view="board" />
                </AnimatedListItem>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
}
