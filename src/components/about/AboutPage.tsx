import {
  BarChart3,
  Bug,
  CalendarDays,
  ExternalLink,
  Github,
  Info,
  ScrollText,
  Timer,
  type LucideIcon
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getIdentifier, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import logoSrc from "../../assets/logo.png";
import { openExternal } from "../../utils/openExternal";
import { Badge } from "../ui/Badge";
import { PageHeader, SettingsSection } from "../ui/PageHeader";

// ── Project links ──────────────────────────────────────────────────────────
const REPO_URL = "https://github.com/mxggle/yolo";
const ISSUES_URL = `${REPO_URL}/issues`;
const RELEASES_URL = `${REPO_URL}/releases`;

type RuntimeInfo = {
  appVersion: string;
  tauriVersion: string | null;
  identifier: string | null;
};

export function AboutPage() {
  const [info, setInfo] = useState<RuntimeInfo>({
    appVersion: __APP_VERSION__,
    tauriVersion: null,
    identifier: null
  });

  // In the desktop shell, pull the real runtime values; in the browser we keep
  // the build-time version injected by Vite.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [appVersion, tauriVersion, identifier] = await Promise.all([
          getVersion(),
          getTauriVersion(),
          getIdentifier()
        ]);
        if (!cancelled) {
          setInfo({ appVersion, tauriVersion, identifier });
        }
      } catch {
        // API unavailable — the build-time fallback version stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          icon={Info}
          eyebrow="About"
          title="About Yolo"
          description="The story, the version, and where to find more."
        />

        <div className="grid gap-5">
          {/* ── Identity ──────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center gap-4">
              <img
                src={logoSrc}
                alt="Yolo logo"
                className="h-16 w-16 shrink-0 rounded-2xl object-contain"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Yolo
                  </h2>
                  <Badge variant="primary">v{info.appVersion}</Badge>
                </div>
                <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                  Make your time count.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              An AI-native desktop productivity app that turns your tasks into
              honest time records — so you always know where your day actually
              went. Most apps help you <em>write</em> tasks. Yolo helps you{" "}
              <em>do</em> them, and understand how long they truly take.
            </p>
          </section>

          {/* ── How it works ──────────────────────────────────────────────── */}
          <SettingsSection
            icon={Timer}
            title="How Yolo works"
            description="Plan the day. Run one focus. Review the truth."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Pillar
                icon={CalendarDays}
                title="Plan"
                text="Lay out what matters before the day pulls you elsewhere."
              />
              <Pillar
                icon={Timer}
                title="Focus"
                text="Run one task at a time and let Yolo keep the clock."
              />
              <Pillar
                icon={BarChart3}
                title="Review"
                text="See exactly where your hours went, then improve."
              />
            </div>
          </SettingsSection>

          {/* ── Links ─────────────────────────────────────────────────────── */}
          <SettingsSection
            icon={Github}
            title="Resources"
            description="Source, issues, and release notes."
          >
            <div className="divide-y divide-border">
              <LinkRow
                icon={Github}
                label="Source code"
                hint="github.com/mxggle/yolo"
                onClick={() => void openExternal(REPO_URL)}
              />
              <LinkRow
                icon={Bug}
                label="Report an issue"
                hint="Found a bug or have a request? Let us know."
                onClick={() => void openExternal(ISSUES_URL)}
              />
              <LinkRow
                icon={ScrollText}
                label="Releases & changelog"
                hint="What's new in each version."
                onClick={() => void openExternal(RELEASES_URL)}
              />
            </div>
          </SettingsSection>

          {/* ── Build info ────────────────────────────────────────────────── */}
          <SettingsSection title="Build">
            <dl className="grid gap-2.5 text-sm">
              <InfoRow label="App version" value={info.appVersion} />
              {info.tauriVersion ? (
                <InfoRow label="Tauri" value={info.tauriVersion} />
              ) : null}
              {info.identifier ? (
                <InfoRow label="Identifier" value={info.identifier} />
              ) : null}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>Tauri</Badge>
              <Badge>React 18</Badge>
              <Badge>TypeScript</Badge>
            </div>
          </SettingsSection>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <footer className="pb-2 pt-1 text-center text-xs text-muted-foreground">
            <p>
              © {year} Yolo · All rights reserved.
            </p>
            <p className="mt-1">
              Built with care and a deep respect for your time.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  text
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-sm font-semibold tracking-tight text-foreground">
        {title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  label,
  hint,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 py-3 text-left outline-none first:pt-0 last:pb-0 focus-visible:shadow-ring"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-fast group-hover:bg-primary-soft group-hover:text-primary-soft-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
