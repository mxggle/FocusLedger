import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { categoryRepository, FALLBACK_CATEGORY_ID } from "../../db/categoryRepository";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Category } from "../../types";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { CategoryDialog } from "./CategoryDialog";

export function CategoryManager() {
  const categories = useTaskStore((state) => state.categories);
  const deleteCategory = useTaskStore((state) => state.deleteCategory);
  const confirm = useUiStore((state) => state.confirm);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setDialogOpen(true);
  }

  async function handleDelete(category: Category) {
    const usage = await categoryRepository.getUsageCount(category.id);
    const message =
      usage > 0
        ? `${usage} item${usage === 1 ? "" : "s"} use "${category.name}". They will be moved to Inbox. This cannot be undone.`
        : `Delete "${category.name}"? This cannot be undone.`;

    const confirmed = await confirm({
      title: "Delete category",
      message,
      confirmLabel: "Delete",
      danger: true
    });
    if (confirmed) {
      await deleteCategory(category.id);
    }
  }

  return (
    <div className="grid gap-3">
      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          hint="Add a category to start grouping your focus time."
          dashed
        />
      ) : (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {categories.map((category) => {
          const isFallback = category.id === FALLBACK_CATEGORY_ID;
          return (
            <li key={category.id} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: category.color ?? "hsl(var(--muted-foreground))" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {category.name}
              </span>
              <div className="flex items-center gap-0.5">
                <IconButton
                  icon={Pencil}
                  label={`Edit ${category.name}`}
                  size="sm"
                  onClick={() => openEdit(category)}
                />
                <IconButton
                  icon={Trash2}
                  label={isFallback ? "Inbox cannot be deleted" : `Delete ${category.name}`}
                  size="sm"
                  disabled={isFallback}
                  onClick={() => void handleDelete(category)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      )}

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add category
        </Button>
      </div>

      <CategoryDialog
        open={dialogOpen}
        category={editing}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
