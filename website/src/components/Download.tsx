import { Apple, Monitor, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DOWNLOAD, SITE } from "../lib/site";
import { cn } from "../lib/cn";
import { Reveal } from "./ui/Reveal";
import { LogoMark } from "./ui/Logo";

const PLATFORMS: { icon: LucideIcon; name: string; note: string; href: string; primary?: boolean }[] = [
  { icon: Apple, name: "macOS", note: "Universal · .dmg", href: DOWNLOAD.mac, primary: true },
  { icon: Monitor, name: "Windows", note: "x64 · .msi", href: DOWNLOAD.windows },
  { icon: Terminal, name: "Linux", note: ".AppImage · .deb", href: DOWNLOAD.linux }
];

export function Download() {
  return (
    <section id="download" className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border-strong bg-surface p-10 text-center shadow-pop sm:p-16">
            {/* glow */}
            <div className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-0 h-72 w-[640px] -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
              <div className="absolute inset-0 bg-grid opacity-[0.4] mask-fade-b" />
            </div>

            <LogoMark size={56} className="mx-auto animate-float" />

            <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Start making your time count</h2>
            <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
              Free to download. Plan the day, run one focus, and review the truth — tonight.
            </p>

            <div className="mx-auto mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
              {PLATFORMS.map((p) => (
                <a
                  key={p.name}
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-1",
                    p.primary
                      ? "border-primary/40 bg-primary text-primary-foreground shadow-md hover:shadow-pop"
                      : "border-border bg-surface-2 hover:border-primary/30 hover:shadow-card"
                  )}
                >
                  <p.icon size={26} className={p.primary ? "" : "text-primary"} />
                  <span className="text-sm font-bold">{p.name}</span>
                  <span className={cn("text-xs", p.primary ? "text-primary-foreground/80" : "text-subtle")}>{p.note}</span>
                </a>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-subtle">
              <span>v{SITE.version}</span>
              <span className="hidden sm:inline">·</span>
              <span>macOS 11+ · Windows 10+ · Linux</span>
              <span className="hidden sm:inline">·</span>
              <a href={DOWNLOAD.releases} target="_blank" rel="noreferrer" className="text-primary-soft-foreground hover:underline">
                All releases &amp; changelog
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
