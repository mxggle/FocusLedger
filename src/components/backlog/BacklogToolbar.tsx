import {
  ArrowUpDown,
  CalendarDays,
  Check,
  LayoutGrid,
  Package,
  Rows3,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import type { Category, TaskPriority } from "../../types";
import {
  hasActiveBacklogFilters,
  type BacklogFilters,
  type BacklogGroupBy,
  type BacklogSortBy,
  type BacklogViewMode
} from "../../utils/backlogView";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Field";
import { Menu, MenuItem } from "../ui/Menu";
import { SegmentedControl } from "../ui/SegmentedControl";

const SORT_LABELS: Record<BacklogSortBy, string> = {
  priority: "Priority",
  newest: "Newest",
  oldest: "Oldest",
  shortest: "Shortest",
  date: "Due date"
};

const GROUP_LABELS: Record<BacklogGroupBy, string> = {
  none: "None",
  category: "Category",
  priority: "Priority",
  date: "Date"
};

type BacklogToolbarProps = {
  filters: BacklogFilters;
  onFiltersChange: (patch: Partial<BacklogFilters>) => void;
  viewMode: BacklogViewMode;
  groupBy: BacklogGroupBy;
  sortBy: BacklogSortBy;
  onViewChange: (patch: {
    viewMode?: BacklogViewMode;
    groupBy?: BacklogGroupBy;
    sortBy?: BacklogSortBy;
  }) => void;
  categories: Category[];
  shownCount: number;
  totalCount: number;
};

export function BacklogToolbar({
  filters,
  onFiltersChange,
  viewMode,
  groupBy,
  sortBy,
  onViewChange,
  categories,
  shownCount,
  totalCount
}: BacklogToolbarProps) {
  const filtersActive = hasActiveBacklogFilters(filters);

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          value={filters.scope}
          onChange={(scope) => onFiltersChange({ scope })}
          segments={[
            { value: "all", label: "All" },
            { value: "backlog", label: "Backlog", icon: Package },
            { value: "scheduled", label: "Scheduled", icon: CalendarDays }
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {filtersActive || filters.scope !== "all"
              ? `${shownCount} of ${totalCount}`
              : `${totalCount} ${totalCount === 1 ? "task" : "tasks"}`}
          </span>
          <SegmentedControl
            size="sm"
            value={viewMode}
            onChange={(mode) => onViewChange({ viewMode: mode })}
            segments={[
              { value: "cards", label: "Cards", icon: LayoutGrid },
              { value: "list", label: "List", icon: Rows3 }
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[240px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <Input
            value={filters.search}
            onChange={(event) => onFiltersChange({ search: event.target.value })}
            placeholder="Search tasks…"
            aria-label="Search backlog tasks"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select
          value={filters.categoryId}
          onChange={(event) => onFiltersChange({ categoryId: event.target.value })}
          aria-label="Filter by category"
          className={cn("h-8 w-36 text-xs", filters.categoryId !== "all" && "border-primary/50")}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <Select
          value={filters.priority}
          onChange={(event) =>
            onFiltersChange({ priority: event.target.value as TaskPriority | "all" })
          }
          aria-label="Filter by priority"
          className={cn("h-8 w-32 text-xs", filters.priority !== "all" && "border-primary/50")}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>

        {filtersActive ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onFiltersChange({ search: "", categoryId: "all", priority: "all" })
            }
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <OptionMenu
            icon={SlidersHorizontal}
            prefix="Group"
            options={GROUP_LABELS}
            value={groupBy}
            onSelect={(value) => onViewChange({ groupBy: value })}
          />
          <OptionMenu
            icon={ArrowUpDown}
            prefix="Sort"
            options={SORT_LABELS}
            value={sortBy}
            onSelect={(value) => onViewChange({ sortBy: value })}
          />
        </div>
      </div>
    </div>
  );
}

/** Dropdown selector rendered as a compact button, e.g. "Sort: Priority". */
function OptionMenu<T extends string>({
  icon: Icon,
  prefix,
  options,
  value,
  onSelect
}: {
  icon: typeof ArrowUpDown;
  prefix: string;
  options: Record<T, string>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <Menu
      align="end"
      trigger={
        <Button type="button" size="sm" variant="secondary">
          <Icon className="h-3.5 w-3.5" />
          {prefix}: {options[value]}
        </Button>
      }
    >
      {(Object.entries(options) as [T, string][]).map(([key, label]) => (
        <MenuItem key={key} onSelect={() => onSelect(key)}>
          <span className="flex items-center justify-between gap-3">
            {label}
            {key === value ? <Check className="h-4 w-4 text-primary" /> : null}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
