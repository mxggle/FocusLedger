import { useEffect, useState } from "react";
import { Input } from "../ui/Field";
import { Switch } from "../ui/Switch";

/**
 * A number input that commits on blur/Enter instead of every keystroke, so
 * clearing the field to retype doesn't instantly write 0 (or snap back to a
 * clamped value) mid-edit. Invalid or empty input falls back on commit.
 */
export function DeferredNumberInput({
  value,
  min,
  max,
  fallback,
  onCommit
}: {
  value: number;
  min?: number;
  max?: number;
  fallback: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow external changes (e.g. another surface updates the setting), but
  // never while the user is typing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  function commit() {
    setFocused(false);
    const parsed = Number(draft);
    let next =
      draft.trim() !== "" && Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function SettingRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <Switch checked={value} onChange={onChange} label={label} />
    </div>
  );
}
