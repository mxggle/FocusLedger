import { Check } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import type { Category } from "../../types";
import {
  CATEGORY_COLOR_PALETTE,
  DEFAULT_CATEGORY_COLOR,
  isValidHexColor,
  normalizeHexColor
} from "../../utils/categoryColors";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Dialog, DialogTitle } from "../ui/Dialog";
import { Field, Input } from "../ui/Field";

type CategoryDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Pass a category to edit, or null/undefined to create a new one. */
  category?: Category | null;
};

export function CategoryDialog({ open, onClose, category }: CategoryDialogProps) {
  const createCategory = useTaskStore((state) => state.createCategory);
  const updateCategory = useTaskStore((state) => state.updateCategory);

  const isEditing = Boolean(category);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog opens for a different category.
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setColor(category?.color ?? DEFAULT_CATEGORY_COLOR);
    setSubmitting(false);
  }, [open, category]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    const result = isEditing
      ? await updateCategory(category!.id, { name: trimmed, color })
      : await createCategory({ name: trimmed, color });
    setSubmitting(false);

    if (result.ok) {
      onClose();
    }
  }

  const customColor = isValidHexColor(color) ? normalizeHexColor(color) : DEFAULT_CATEGORY_COLOR;

  return (
    <Dialog open={open} onClose={onClose} size="sm" className="p-5" ariaLabel="Category">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <DialogTitle>{isEditing ? "Edit category" : "New category"}</DialogTitle>

        <Field label="Name">
          <Input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. Deep work"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Color</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_PALETTE.map((swatch) => {
              const selected = normalizeHexColor(color) === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use color ${swatch}`}
                  aria-pressed={selected}
                  onClick={() => setColor(swatch)}
                  style={{ backgroundColor: swatch }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full outline-none transition-transform duration-fast",
                    "hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    selected && "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                  )}
                >
                  {selected ? <Check className="h-3.5 w-3.5 text-white drop-shadow" /> : null}
                </button>
              );
            })}
            <label
              className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border-strong text-[10px] font-semibold text-muted-foreground"
              title="Custom color"
              style={{ backgroundColor: customColor }}
            >
              <input
                type="color"
                value={customColor}
                onChange={(event) => setColor(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Custom color"
              />
            </label>
          </div>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!name.trim()}>
            {isEditing ? "Save" : "Add category"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
