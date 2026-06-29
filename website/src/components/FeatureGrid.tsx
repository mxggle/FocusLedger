import {
  Bell,
  CalendarRange,
  Coffee,
  ListChecks,
  MoonStar,
  Moon,
  NotebookPen,
  Share2,
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
    icon: Bell,
    title: "Quick add from anywhere",
    body: "A global capture dialog drops an idea into Today or Backlog with category, priority, and estimate in one keystroke."
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
    icon: MoonStar,
    title: "Light & dark, by design",
    body: "A calm, Linear-grade interface that's beautiful in both themes and tuned for long focus sessions."
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
