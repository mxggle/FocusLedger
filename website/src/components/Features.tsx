import { FeatureRow } from "./FeatureRow";
import { SectionHeading } from "./ui/SectionHeading";
import { AppWindow } from "./mockups/AppWindow";
import { FocusMock } from "./mockups/FocusMock";
import { LifeMock } from "./mockups/LifeMock";
import { MyDayMock } from "./mockups/MyDayMock";

export function Features() {
  return (
    <section id="features" className="relative border-t border-border bg-surface-2/40 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Every part of the day, accounted for"
          description="From the first task you plan to the week you look back on — Yolo turns intention into an honest, reviewable time record."
        />

        <div className="mt-20 flex flex-col gap-28">
          <FeatureRow
            id="focus"
            eyebrow="Focus & ambient scenes"
            title="One focus. The rest of the world, dimmed."
            description="Run a single task at a time and expand it to a full-screen focus stage. Pick an ambient scene — None, Rain, Fire, or River — and the whole interface takes on its color: the ring, the timer, the controls. Mix in soundscapes — rain, fire, river, wind, birds, brown noise — right in the app."
            points={[
              "One active task at a time — no multitasking noise",
              "Scene-tinted chrome via a live focus accent",
              "Six mixable ambient sound layers with per-track volume",
              "Rest mode: a calmer indigo stage with a draining timer"
            ]}
            visual={
              <AppWindow title="Yolo — Focus" accent="190 95% 55%">
                <FocusMock />
              </AppWindow>
            }
          />

          <FeatureRow
            flip
            eyebrow="My Day · honest review"
            title="See where the day actually went"
            description="My Day turns your sessions and stop-notes into a review you'll actually read: hero stats, a category donut, estimate-vs-reality, and a warm, honest 'Story of your day'. Every number is computed from your real records — the AI only narrates them."
            points={[
              "Estimate vs. reality on the day and every category",
              "Day timeline of real focus sessions",
              "“Story of your day” — AI narration, never invented numbers",
              "Share your day as an image"
            ]}
            visual={
              <AppWindow title="Yolo — My Day">
                <MyDayMock />
              </AppWindow>
            }
          />

          <FeatureRow
            eyebrow="Memento Mori"
            title="See your life in weeks"
            description="Zoom all the way out. Every week of your life on one canvas, heat-mapped by the focus you actually tracked — so you can spot the high-focus stretches and drill straight back into the days behind them."
            points={[
              "Lived · Left · Spent, at a glance",
              "Weeks shaded by real tracked focus",
              "Click a week to inspect or open it in History",
              "A long-horizon nudge to make the squares count"
            ]}
            visual={
              <AppWindow title="Yolo — Life">
                <LifeMock />
              </AppWindow>
            }
          />
        </div>
      </div>
    </section>
  );
}
