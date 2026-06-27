import { Bell, Check, ChevronDown, SlidersHorizontal, Sparkles, type LucideIcon } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { PermissionLevel } from "../../services/ai/assistant/agentTools/types";
import { Menu, MenuItem } from "../ui/Menu";
import { cn } from "../../utils/cn";

type AutonomyOption = {
  value: PermissionLevel;
  label: string;
  icon: LucideIcon;
  hint: string;
};

const AUTONOMY_OPTIONS: AutonomyOption[] = [
  { value: "plan", label: "Plan", icon: SlidersHorizontal, hint: "Proposes changes only" },
  { value: "ask", label: "Ask", icon: Bell, hint: "Confirms each change" },
  { value: "auto", label: "Auto", icon: Sparkles, hint: "Applies reversible changes" }
];

/**
 * Compact autonomy selector for the composer footer — mirrors the
 * "Assistant autonomy" control in Settings so the user can switch how the
 * assistant applies changes without leaving the chat.
 */
export function AutonomyMenu() {
  const level = useSettingsStore((s) => s.settings.assistantPermissionLevel);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const active = AUTONOMY_OPTIONS.find((o) => o.value === level) ?? AUTONOMY_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <Menu
      align="start"
      side="top"
      className="min-w-[220px]"
      trigger={
        <button
          type="button"
          aria-label={`Autonomy: ${active.label}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5",
            "text-[11px] font-medium text-muted-foreground outline-none transition-colors",
            "hover:bg-muted hover:text-foreground focus-visible:shadow-ring"
          )}
        >
          <ActiveIcon className="h-3 w-3" />
          {active.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      }
    >
      {AUTONOMY_OPTIONS.map((option) => {
        const selected = option.value === level;
        return (
          <MenuItem
            key={option.value}
            icon={option.icon}
            onSelect={() => void updateSetting("assistantPermissionLevel", option.value)}
          >
            <span className="flex items-center justify-between gap-2">
              <span>
                <span className="block font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
              {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
