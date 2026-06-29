import { CalendarCheck, LineChart, Timer } from "lucide-react";
import { Reveal } from "./ui/Reveal";
import { SectionHeading } from "./ui/SectionHeading";

const STEPS = [
  {
    icon: CalendarCheck,
    step: "01",
    title: "Plan the day",
    body: "Lay out today with estimates, categories, and priorities. Carry overdue work forward without losing its context.",
    tone: "text-primary",
    ring: "ring-primary/20 bg-primary-soft"
  },
  {
    icon: Timer,
    step: "02",
    title: "Run one focus",
    body: "Start a single task. A precise timer tracks the session — surviving restarts — while an ambient scene keeps you in flow.",
    tone: "text-accent",
    ring: "ring-accent/20 bg-accent/10"
  },
  {
    icon: LineChart,
    step: "03",
    title: "Review the truth",
    body: "See estimated vs. actual, category totals, and a 7-day history. Learn where your time really went — and plan smarter.",
    tone: "text-success",
    ring: "ring-success/20 bg-success-soft"
  }
];

export function Workflow() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="The rhythm"
          title="Most apps help you write tasks. Yolo helps you do them."
          description="The hard part isn't the list — it's knowing when you started, how long it took, and what you actually got done. Yolo keeps an honest record, end to end."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.step} delay={i * 0.1}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className={`grid h-12 w-12 place-items-center rounded-xl ring-1 ${s.ring}`}>
                    <s.icon size={22} className={s.tone} />
                  </span>
                  <span className="font-mono text-sm font-semibold text-subtle">{s.step}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
