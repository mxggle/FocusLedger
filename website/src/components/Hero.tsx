import { motion } from "framer-motion";
import { Apple, ArrowRight, Download } from "lucide-react";
import { SITE } from "../lib/site";
import { ButtonLink } from "./ui/Button";
import { AppWindow } from "./mockups/AppWindow";
import { TodayMock } from "./mockups/TodayMock";

const STATS = [
  { value: "1 focus", label: "at a time" },
  { value: "Est vs actual", label: "on every task" },
  { value: "MCP", label: "for your agents" }
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[860px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute right-[12%] top-24 h-72 w-72 rounded-full bg-accent/15 blur-[100px]" />
        <div className="absolute inset-0 bg-grid mask-fade-b opacity-50" />
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <motion.div
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <a
            href="#features"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              v{SITE.version}
            </span>
            New: AI smart capture &amp; the day line
            <ArrowRight size={13} />
          </a>

          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Make your <span className="text-gradient">time</span> count.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {SITE.description}
          </p>

          <p className="mt-4 text-sm font-semibold tracking-wide text-primary-soft-foreground">
            {SITE.throughline}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <ButtonLink href="#download" size="lg">
              <Apple size={18} /> Download for macOS
            </ButtonLink>
            <ButtonLink href="#features" size="lg" variant="secondary">
              See how it works <ArrowRight size={16} />
            </ButtonLink>
          </div>

          <div className="mt-3 text-xs text-subtle">Free · macOS, Windows &amp; Linux · Built on Tauri</div>
        </motion.div>

        {/* product window */}
        <motion.div
          className="relative mx-auto mt-16 max-w-6xl"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <div className="absolute -inset-x-8 -top-6 bottom-0 -z-10 rounded-[40px] bg-gradient-to-b from-primary/20 to-transparent blur-2xl" />
          <AppWindow title="Yolo — Today">
            <TodayMock />
          </AppWindow>

          <div className="mt-10 grid grid-cols-3 gap-4 sm:gap-8">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center text-center">
                <div className="text-lg font-bold text-foreground sm:text-2xl">{s.value}</div>
                <div className="text-xs text-muted-foreground sm:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <a href="#download" className="sr-only">
        <Download /> Download Yolo
      </a>
    </section>
  );
}
