import { Reveal } from "./ui/Reveal";
import { SectionHeading } from "./ui/SectionHeading";
import { AppWindow } from "./mockups/AppWindow";
import { BacklogMock, HistoryMock, PlanMock } from "./mockups/SmallScreens";

const SCREENS = [
  {
    title: "Plan",
    blurb: "Recurring tasks that auto-generate today — daily, weekdays, or custom days.",
    mock: <PlanMock />,
    window: "Yolo — Plan"
  },
  {
    title: "Backlog",
    blurb: "Capture ideas and future-dated work; pull them into today, tomorrow, or next week.",
    mock: <BacklogMock />,
    window: "Yolo — Backlog"
  },
  {
    title: "History",
    blurb: "Last 7 days of focus at a glance, with per-day totals, drift, and time records.",
    mock: <HistoryMock />,
    window: "Yolo — History"
  }
];

export function ScreensGallery() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Every screen"
          title="A place for the whole workflow"
          description="Plan recurring work, capture the backlog, and look back over the week — every view shares the same calm, focused design."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {SCREENS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <div className="absolute -inset-3 -z-10 rounded-3xl bg-gradient-to-br from-primary/8 to-accent/8 blur-xl" />
                  <AppWindow title={s.window}>{s.mock}</AppWindow>
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
