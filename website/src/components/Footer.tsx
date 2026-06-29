import { Github } from "lucide-react";
import { NAV_LINKS, SITE } from "../lib/site";
import { LogoMark } from "./ui/Logo";

const TECH = ["Tauri v2", "React 18", "TypeScript", "Tailwind", "SQLite", "MCP"];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-2/50">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <LogoMark size={30} />
              <span className="text-[17px] font-bold tracking-tight">Yolo</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{SITE.tagline}</p>
            <p className="mt-1 text-xs text-subtle">{SITE.throughline}</p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-subtle">Product</div>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#download" className="text-muted-foreground transition-colors hover:text-foreground">
                    Download
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-subtle">Project</div>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                <li>
                  <a href={SITE.repo} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={`${SITE.repo}/releases`} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
                    Releases
                  </a>
                </li>
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-subtle">Built with</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TECH.map((t) => (
                  <span key={t} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-subtle">© {SITE.name} · Make your time count.</p>
          <a
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </footer>
  );
}
