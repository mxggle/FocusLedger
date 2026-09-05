import { BarChart3, CalendarDays, CheckSquare, Hourglass, Inbox, Info, Settings, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MockPlatform } from "./AppWindow";
import { cn } from "../../lib/cn";

const ITEMS: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: CheckSquare, label: "Today", active: true },
  { icon: Sparkles, label: "My Day" },
  { icon: Inbox, label: "Backlog" },
  { icon: CalendarDays, label: "Plan" },
  { icon: Hourglass, label: "Life" },
  { icon: BarChart3, label: "History" }
];

const FOOTER: { icon: LucideIcon; label: string }[] = [
  { icon: Settings, label: "Settings" },
  { icon: Info, label: "About" }
];

/**
 * The navigation rail, as the app draws it: sitting directly on the window
 * material with no fill or divider of its own. The only platform difference is
 * how the selected row is marked — a filled capsule on macOS, the same capsule
 * plus Fluent's leading selection bar on Windows.
 */
export function Sidebar({ className, platform = "mac" }: { className?: string; platform?: MockPlatform }) {
  const row = (Icon: LucideIcon, label: string, active?: boolean) => (
    <div
      key={label}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium",
        active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground"
      )}
    >
      {active && platform === "windows" && (
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
      )}
      <Icon size={16} />
      {label}
    </div>
  );

  return (
    <div className={cn("flex w-[196px] shrink-0 flex-col", className)}>
      <nav className="flex-1 space-y-0.5 px-3 pb-2">
        {ITEMS.map(({ icon, label, active }) => row(icon, label, active))}
      </nav>
      <p className="px-3 pb-2 text-[11px] leading-snug text-subtle">Make your time count.</p>
      <div className="px-3 pb-3">
        <div className="mb-2 h-px bg-border/70" />
        <nav className="space-y-0.5">{FOOTER.map(({ icon, label }) => row(icon, label))}</nav>
      </div>
    </div>
  );
}
