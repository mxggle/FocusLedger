import {
  Bell,
  CalendarRange,
  Coffee,
  LayoutGrid,
  ListChecks,
  ListFilter,
  MenuSquare,
  MoonStar,
  Moon,
  NotebookPen,
  PanelLeft,
  Share2,
  SquareDashed,
  Sparkles,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "./ui/Reveal";
import { SectionHeading } from "./ui/SectionHeading";

const ITEMS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ListChecks,
    title: "Full task lifecycle",
    body: "Start → pause → resume → stop → complete (or drop). Category, priority, estimate, and due date on every task."
  },
  {
    icon: Zap,
    title: "Timer that survives restarts",
    body: "A precise per-session timer keeps running across app restarts, and splits sessions accurately across midnight."
  },
  {
    icon: NotebookPen,
    title: "Honest stop-session notes",
    body: "“What did this time buy you?” Capture what got done, any blocker, the next action, and a felt completion rate."
  },
  {
    icon: CalendarRange,
    title: "Planning rhythm",
    body: "Move work between today, tomorrow, next week, and backlog. Carry overdue forward with its original context intact."
  },
  {
    icon: Sparkles,
    title: "AI smart capture",
    body: "Type a task the way you'd say it — “review the deck tomorrow, high prio, ~30m” — and AI fills in the category, priority, estimate, and due date. Your text is never lost."
  },
  {
    icon: Bell,
    title: "Quick add from anywhere",
    body: "A global capture dialog drops an idea into Today or Backlog in one keystroke — smart capture included."
  },
  {
    icon: ListFilter,
    title: "A backlog you can triage",
    body: "Group, sort, and shape the backlog with view preferences that persist — a real workspace, not a flat list."
  },
  {
    icon: MenuSquare,
    title: "Menu-bar timer",
    body: "On macOS, the running timer lives in your menu bar in steady fixed-width digits — glanceable even when the app is hidden."
  },
  {
    icon: Coffee,
    title: "Rest mode",
    body: "Take honest, intentional breaks. Rest is tracked as rest — never disguised as a task or padded into your focus time."
  },
  {
    icon: Share2,
    title: "Share your day",
    body: "Export My Day as a clean image to save or share — your real focus, sessions, and story in one card."
  },
  {
    icon: Moon,
    title: "Tidy reminders",
    body: "Reminder toasts collapse into a fan-out deck with a single Clear all — never a cluttered corner of the screen."
  },
  {
    icon: LayoutGrid,
    title: "Settings, in tabs",
    body: "General, Assistant, Categories, Rest, and System each get their own tab — and the app can deep-link you straight to the one you need."
  },
  {
    icon: PanelLeft,
    title: "A rail that gets out of the way",
    body: "Collapse the navigation to icons when you want the width, and the selected row's fill glides between destinations rather than blinking."
  },
  {
    icon: SquareDashed,
    title: "A quieter task list",
    body: "One accented control per card, a badge only when the status isn't the default, and elapsed-vs-estimate as a hairline — a list of work, not a stack of buttons."
  },
  {
    icon: MoonStar,
    title: "Calm, by design",
    body: "A Linear-grade interface in light and dark, with a single shared motion language — quiet fades and glides that respect reduced-motion preferences."
  }
];

export function FeatureGrid() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading eyebrow="And more" title="Thoughtful, all the way down" />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={(i % 3) * 0.06}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110">
                  <item.icon size={20} />
                </span>
                <h3 className="mt-4 text-base font-bold tracking-tight">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
