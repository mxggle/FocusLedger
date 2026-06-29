import { Ban, Bird, CloudRain, Droplets, Flame, Minimize2, Pause, Volume2, Waves, Wind } from "lucide-react";
import { cn } from "../../lib/cn";

const SCENES = [
  { icon: Ban, label: "None" },
  { icon: CloudRain, label: "Rain", active: true },
  { icon: Flame, label: "Fire" },
  { icon: Waves, label: "River" }
];

const SOUNDS = [
  { icon: Droplets, label: "Rain", vol: 0.5, on: true },
  { icon: Wind, label: "Wind", vol: 0.35, on: true },
  { icon: Bird, label: "Birds", vol: 0.0, on: false }
];

/**
 * The full-screen Focus Zen overlay with an ambient scene. The scene tints the
 * chrome via --focus-accent (here a misted rain-blue), matching the real app.
 */
export function FocusMock() {
  const C = 2 * Math.PI * 52;
  const progress = 0.62;
  return (
    <div
      className="relative flex h-[480px] flex-col text-white"
      style={{ background: "radial-gradient(120% 90% at 50% 8%, #1e3a5f 0%, #12233b 55%, #0a1626 100%)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "repeating-linear-gradient(105deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 9px)"
        }}
      />

      {/* top bar */}
      <div className="relative flex items-center justify-end gap-2 px-5 py-3.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
          <Waves size={15} />
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
          <Minimize2 size={15} />
        </span>
      </div>

      {/* center stage */}
      <div className="relative flex flex-1 flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Current Focus</div>
        <div className="mt-1.5 text-center text-[17px] font-semibold text-white/90">Ship onboarding redesign</div>

        <div className="relative mt-4 grid h-[190px] w-[190px] place-items-center">
          <svg className="absolute -rotate-90" viewBox="0 0 120 120" width="190" height="190">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#5cc8ff"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ filter: "drop-shadow(0 0 8px rgba(92,200,255,0.55))" }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <div className="font-mono text-[36px] font-semibold leading-none tabular-nums">48:12</div>
            <div className="mt-1 text-[11px] text-cyan-200/70">120 min · 40%</div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2.5">
          <button className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-[13px] font-semibold backdrop-blur-sm ring-1 ring-white/20">
            <Pause size={15} /> Pause
          </button>
          <button className="inline-flex items-center gap-2 rounded-full bg-cyan-400/90 px-5 py-2.5 text-[13px] font-semibold text-[#0a1626]">
            Done
          </button>
        </div>
      </div>

      {/* ambient popover — scene + sounds */}
      <div className="absolute right-5 top-14 w-60 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-md">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-white/50">Scene</div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {SCENES.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border py-1.5 text-[9px]",
                active ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-white/60"
              )}
            >
              <Icon size={13} /> {label}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[9px] font-semibold uppercase tracking-wide text-white/50">Sounds</div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {SOUNDS.map(({ icon: Icon, label, vol, on }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded",
                  on ? "bg-cyan-400/20 text-cyan-200" : "text-white/40"
                )}
              >
                <Icon size={11} />
              </span>
              <span className="w-12 text-[10px] text-white/70">{label}</span>
              <div className="h-1 flex-1 rounded-full bg-white/15">
                <div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${vol * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-2">
            <Volume2 size={12} className="text-white/60" />
            <span className="w-12 text-[10px] text-white/70">Master</span>
            <div className="h-1 flex-1 rounded-full bg-white/15">
              <div className="h-full rounded-full bg-white/60" style={{ width: "60%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
