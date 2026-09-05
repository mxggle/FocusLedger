import {
  Bell,
  Brain,
  CalendarClock,
  KeyRound,
  LineChart,
  ListChecks,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppWindow } from "./mockups/AppWindow";
import { AssistantMock } from "./mockups/AssistantMock";
import { Reveal } from "./ui/Reveal";
import { Eyebrow, SectionHeading } from "./ui/SectionHeading";

const AUTONOMY: { icon: LucideIcon; name: string; hint: string }[] = [
  { icon: SlidersHorizontal, name: "Plan", hint: "Proposes changes only" },
  { icon: Bell, name: "Ask", hint: "Confirms each change" },
  { icon: Sparkles, name: "Auto", hint: "Applies reversible changes" }
];

/** The catalog the model picker ships with, minus the long tail. */
const PROVIDERS = [
  "Claude",
  "OpenAI",
  "Gemini",
  "xAI",
  "DeepSeek",
  "Mistral",
  "Moonshot",
  "Zhipu",
  "Qwen",
  "Groq",
  "Together",
  "OpenRouter",
  "ChatGPT / Codex",
  "Ollama",
  "LM Studio",
  "Any OpenAI-compatible endpoint"
] as const;

const CAPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LineChart,
    title: "History-aware, never invented",
    body: "It knows you run 1.4× over on design work because that's computed from your real records. Numbers are calculated in code — the model only narrates them, so it can't make them up."
  },
  {
    icon: Brain,
    title: "It learns you — on your terms",
    body: "Durable facts about how you work are remembered and recalled. Give it a name and a “soul”, write an About-me profile it reads every turn, and inspect, pin, or forget anything it learned."
  },
  {
    icon: CalendarClock,
    title: "A day briefing before you start",
    body: "A glanceable banner shows how full your day is versus your target — overcommitted, light, or on track — so you right-size the plan before the first focus."
  },
  {
    icon: TerminalSquare,
    title: "Slash commands & recall",
    body: "Type /plan, /today, /reschedule, or /backlog for one-tap requests — and ask “when did I last work on X?” to search your logged sessions."
  }
];

export function AssistantShowcase() {
  return (
    <section id="ai" className="relative overflow-hidden border-t border-border py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-24 h-96 w-[760px] -translate-x-1/2 rounded-full bg-primary/12 blur-[130px]" />
        <div className="absolute right-[14%] top-1/2 h-72 w-72 rounded-full bg-accent/12 blur-[110px]" />
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow={
            <>
              <Sparkles size={13} /> AI-native
            </>
          }
          title="An assistant that reads your day — and can act on it"
          description="Yolo is AI-native, not AI-bolted-on. A docked, resizable assistant lives beside your work: a tool-calling agent that talks in plain language and acts through validated task tools — create, start, reschedule, complete, or drop — but it’s propose-then-confirm, so every change is yours to approve, and anything can be undone. Run it on any of fifteen providers, signed in or with your own key."
        />

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* left: behavior model */}
          <Reveal className="flex flex-col gap-8">
            <div>
              <Eyebrow>Propose → confirm → revert</Eyebrow>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                The assistant proposes changes as cards you approve — one tap to <strong className="text-foreground">Apply all</strong>,
                and a <strong className="text-foreground">Revert</strong> on anything it touched. It never edits your tasks behind your back.
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold">Choose how hands-on it is</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {AUTONOMY.map((a) => (
                  <div key={a.name} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                    <a.icon size={18} className="text-primary" />
                    <div className="mt-2 text-sm font-bold">{a.name}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold">Bring any model</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Fifteen providers, from the frontier labs to whatever is running on your own
                machine. Sign in through your browser where the provider supports it, or paste a
                key — each provider keeps its own credentials, so switching back doesn&rsquo;t lose
                what you set up. Then pick the model from a list of what your key can actually
                reach, instead of spelling an id into a text box and finding out it was wrong a
                request later.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PROVIDERS.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={13} className="text-success" /> Every change revertible
              </span>
              <span className="inline-flex items-center gap-1.5">
                <KeyRound size={13} className="text-primary" /> Sign in, or bring your own key
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks size={13} className="text-primary" /> Models picked from a list
              </span>
            </div>
          </Reveal>

          {/* right: the dock */}
          <Reveal delay={0.1} className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 to-accent/10 blur-2xl" />
            <AppWindow title="Yolo — Assistant" className="mx-auto max-w-md">
              <AssistantMock />
            </AppWindow>
          </Reveal>
        </div>

        {/* deeper capabilities */}
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 4) * 0.06}>
              <div className="h-full rounded-2xl border border-border bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <c.icon size={20} />
                </span>
                <h3 className="mt-4 text-[15px] font-bold tracking-tight">{c.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
