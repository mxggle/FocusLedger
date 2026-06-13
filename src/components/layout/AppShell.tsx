import {
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon
} from "lucide-react";
import logoSrc from "../../assets/logo.png";
import type { ReactNode } from "react";
import { useUiStore } from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { Tooltip } from "../ui/Tooltip";

type Route<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

type AppShellProps<T extends string> = {
  routes: Route<T>[];
  activeRoute: T;
  onRouteChange: (route: T) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AppShell<T extends string>({
  routes,
  activeRoute,
  onRouteChange,
  title,
  subtitle,
  children
}: AppShellProps<T>) {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── Title bar ──────────────────────────────────────────────────────────
          One full-width drag region across the very top. It houses the native
          macOS traffic lights and lets the user drag the whole window. The
          column divider lives below it, so the lights never clash with the
          sidebar border — even when collapsed. No interactive children, so
          dragging can never trigger a click. */}
      <div data-tauri-drag-region className="h-9 shrink-0" aria-hidden="true" />

      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur-sm",
          "motion-safe:transition-[width] motion-safe:duration-normal",
          sidebarCollapsed ? "w-[60px]" : "w-[232px]"
        )}
      >
        {/* Brand / toggle */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2.5 px-3",
            sidebarCollapsed && "justify-center"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <img src={logoSrc} alt="Yolo logo" className="h-8 w-8 object-contain" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                {title}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {subtitle}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-2.5 py-2">
          {routes.map((route) => {
            const Icon = route.icon;
            const active = activeRoute === route.id;
            const button = (
              <button
                type="button"
                onClick={() => onRouteChange(route.id)}
                aria-label={route.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none",
                  "transition-colors duration-fast focus-visible:shadow-ring",
                  sidebarCollapsed && "justify-center",
                  active
                    ? "bg-primary-soft text-primary-soft-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-transform duration-fast",
                    !active && "group-hover:scale-110"
                  )}
                />
                {!sidebarCollapsed && (
                  <span className="truncate">{route.label}</span>
                )}
              </button>
            );

            return sidebarCollapsed ? (
              <Tooltip key={route.id} content={route.label} side="right">
                {button}
              </Tooltip>
            ) : (
              <div key={route.id}>{button}</div>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="shrink-0 border-t border-border p-2.5">
          <Tooltip
            content={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            side="right"
            disabled={!sidebarCollapsed}
          >
            <button
              type="button"
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground outline-none",
                "transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:shadow-ring",
                sidebarCollapsed && "justify-center"
              )}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
              )}
              {!sidebarCollapsed && <span>Collapse</span>}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
