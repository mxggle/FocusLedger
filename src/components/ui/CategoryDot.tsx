import { cn } from "../../utils/cn";
import { resolveCategoryColor } from "../../utils/category";

/** Small color dot used to mark a task's category across the app. */
export function CategoryDot({
  color,
  className
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
        className
      )}
      style={{ backgroundColor: resolveCategoryColor(color) }}
      aria-hidden="true"
    />
  );
}
