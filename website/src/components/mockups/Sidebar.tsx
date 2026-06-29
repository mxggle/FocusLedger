import { BarChart3, CalendarDays, CheckSquare, Hourglass, Inbox, Info, Settings, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoMark } from "../ui/Logo";
import { cn } from "../../lib/cn";

const ITEMS: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: CheckSquare, label: "Today", active: true },
  { icon: Sparkles, label: "My Day" },
  { icon: Inbox, label: "Backlog" },
  { icon: CalendarDays, label: "Plan" },
  { icon: Hourglass, label: "Life" },
  { icon: BarChart3, label: "History" }
];

/** Left rail matching the app's real navigation (macOS floating style). */
export function Sidebar({ className }: { className?: string }) {
  return (
    <nav className={cn("flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-2 p-3", className)}>
      <div className="mb-4 flex items-center gap-2.5 px-1.5">
        <LogoMark size={26} />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Yolo</div>
          <div className="text-[10px] text-muted-foreground">Make your time count.</div>
        </div>
      </div>
      {ITEMS.map(({ icon: Icon, label, active }) => (
        <div
          key={label}
          className={cn(
            "relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium",
            active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground"
          )}
        >
          {active && <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-primary" />}
          <Icon size={16} className={active ? "text-primary" : ""} />
          {label}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-2">
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground">
          <Settings size={16} /> Settings
        </div>
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground">
          <Info size={16} /> About
        </div>
      </div>
    </nav>
  );
}
