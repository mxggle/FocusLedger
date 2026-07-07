import { AnimatePresence } from "framer-motion";
import { Package, Plus, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useShortcutLabel } from "../../hooks/useShortcutLabel";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import {
  DEFAULT_BACKLOG_FILTERS,
  filterBacklogTasks,
  groupBacklogTasks,
  hasActiveBacklogFilters,
  sortBacklogTasks,
  type BacklogFilters,
  type BacklogGroup,
  type BacklogViewMode
} from "../../utils/backlogView";
import { cn } from "../../utils/cn";
import { toDateKey } from "../../utils/date";
import { AnimatedListItem } from "../ui/AnimatedListItem";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { BacklogBoard } from "./BacklogBoard";
import { BacklogTaskTable } from "./BacklogTable";
import { BacklogTaskItem } from "./BacklogTaskItem";
import { BacklogToolbar } from "./BacklogToolbar";
import { useBacklogViewPrefs } from "./useBacklogViewPrefs";

export function BacklogPage() {
  const backlogTasks = useTaskStore((state) => state.backlogTasks);
  const allTasks = useTaskStore((state) => state.allTasks);
  const categories = useTaskStore((state) => state.categories);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);
  const shortcutLabel = useShortcutLabel();
  const todayDate = toDateKey();

  const { prefs, updatePrefs } = useBacklogViewPrefs();
  const [filters, setFilters] = useState<BacklogFilters>({
    ...DEFAULT_BACKLOG_FILTERS,
    scope: prefs.scope
  });

  // Future-dated scheduled work; today's tasks live on the Today page.
  const scheduledTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.due_date &&
          task.due_date > todayDate &&
          task.status !== "done" &&
          task.status !== "dropped"
      ),
    [allTasks, todayDate]
  );

  const combinedTasks = useMemo(
    () => [...scheduledTasks, ...backlogTasks],
    [scheduledTasks, backlogTasks]
  );

  const groups = useMemo(() => {
    const visible = sortBacklogTasks(
      filterBacklogTasks(combinedTasks, filters),
      prefs.sortBy
    );
    // The board needs a grouping dimension for its columns, so "Group: None"
    // falls back to priority there.
    const groupBy =
      prefs.viewMode === "board" && prefs.groupBy === "none"
        ? "priority"
        : prefs.groupBy;
    return groupBacklogTasks(visible, groupBy, categories);
  }, [combinedTasks, filters, prefs.sortBy, prefs.groupBy, prefs.viewMode, categories]);

  // Const alias so TypeScript narrows the board case out of the union below.
  const viewMode = prefs.viewMode;
  const shownCount = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const filtersActive = hasActiveBacklogFilters(filters);

  function handleFiltersChange(patch: Partial<BacklogFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    // Scope doubles as a view preference so the page reopens on the same tab.
    if (patch.scope) updatePrefs({ scope: patch.scope });
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <div
        className={cn(
          "mx-auto",
          viewMode === "board" ? "max-w-6xl" : "max-w-4xl"
        )}
      >
        <PageHeader
          icon={Package}
          eyebrow="Backlog"
          title="Captured & scheduled work"
          actions={
            <Button type="button" onClick={openQuickAdd}>
              <Plus className="h-4 w-4" />
              Quick add
            </Button>
          }
        />

        <BacklogToolbar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          viewMode={viewMode}
          groupBy={prefs.groupBy}
          sortBy={prefs.sortBy}
          onViewChange={updatePrefs}
          categories={categories}
          shownCount={shownCount}
          totalCount={combinedTasks.length}
        />

        <div
          className={cn("mt-5", viewMode !== "board" && "grid gap-6")}
        >
          {shownCount === 0 ? (
            combinedTasks.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Backlog is clear."
                hint={`Use Quick add (${shortcutLabel}) to capture ideas.`}
                dashed
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No tasks match."
                hint={
                  filtersActive
                    ? "Try loosening the search or filters."
                    : "Nothing in this view yet — switch tabs or capture something new."
                }
                action={
                  filtersActive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        handleFiltersChange({
                          search: "",
                          categoryId: "all",
                          priority: "all"
                        })
                      }
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
                dashed
              />
            )
          ) : viewMode === "board" ? (
            <BacklogBoard groups={groups} />
          ) : (
            groups.map((group) => (
              <BacklogGroupSection
                key={group.key}
                group={group}
                viewMode={viewMode}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BacklogGroupSection({
  group,
  viewMode
}: {
  group: BacklogGroup;
  viewMode: Exclude<BacklogViewMode, "board">;
}) {
  return (
    <section>
      {group.label ? (
        <div className="mb-3 flex items-center gap-2 px-0.5">
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
      ) : null}

      {viewMode === "table" ? (
        <BacklogTaskTable tasks={group.tasks} />
      ) : viewMode === "cards" ? (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
            {group.tasks.map((task) => (
              <AnimatedListItem key={task.id}>
                <BacklogTaskItem task={task} view="cards" />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <AnimatePresence initial={false}>
            {group.tasks.map((task) => (
              <AnimatedListItem key={task.id}>
                <BacklogTaskItem task={task} view="list" />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
