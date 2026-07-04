import { motion, useReducedMotion } from "framer-motion";
import {
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon
} from "lucide-react";
import logoSrc from "../../assets/logo.png";
import type { ReactNode } from "react";
import { useUiStore } from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { settle } from "../../utils/motion";
import { isMac } from "../../utils/platform";
import { Tooltip } from "../ui/Tooltip";

type Route<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** "footer" pins the route to a meta section at the bottom of the sidebar
   *  (Settings/About), keeping the day-to-day destinations up top. */
  group?: "footer";
};

type AppShellProps<T extends string> = {
  routes: Route<T>[];
  activeRoute: T;
  onRouteChange: (route: T) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Docked rail rendered to the right of the main content. As a flex sibling
   *  it reflows `<main>` instead of overlaying it — so the task list stays
   *  visible and interactive while the assistant is open. */
  rightRail?: ReactNode;
};

export function AppShell<T extends string>({
  routes,
  activeRoute,
  onRouteChange,
  title,
  subtitle,
  children,
  rightRail
}: AppShellProps<T>) {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const reduceMotion = useReducedMotion();

  // ── Brand (shared) ──────────────────────────────────────────────────────
  const brand = (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-2.5 px-3",
        sidebarCollapsed && "justify-center"
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        <img src={logoSrc} alt="Yolo logo" className="h-7 w-7 object-contain" />
      </div>
      {!sidebarCollapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {title}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );

  // ── Nav (shared) ────────────────────────────────────────────────────────
  const renderRoute = (route: Route<T>) => {
    const Icon = route.icon;
    const active = activeRoute === route.id;
    const button = (
      <button
        type="button"
        onClick={() => onRouteChange(route.id)}
        aria-label={route.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none",
          "transition-colors duration-fast focus-visible:shadow-ring",
          sidebarCollapsed && "justify-center",
          active
            ? "text-primary-soft-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {/* Shared-layout pill: one element glides between routes instead of
            each button toggling its own background. Icon/label are `relative`
            so they paint above it without extra z-index. */}
        {active && (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-lg bg-primary-soft"
            // settle, shortened: the pill glides and stops dead — no bounce,
            // matching the app's no-overshoot arrival language.
            transition={
              reduceMotion ? { duration: 0 } : { ...settle, duration: 0.25 }
            }
            aria-hidden="true"
          />
        )}
        {/* Floating (macOS) variant uses a filled pill only — no left accent
            bar, which would clip against the card's rounded edge. */}
        {active && !isMac && (
          <span
            className="yolo-brand-gradient absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
            aria-hidden="true"
          />
        )}
        <Icon
          className={cn(
            "relative h-4 w-4 shrink-0 transition-transform duration-fast",
            !active && "group-hover:scale-110"
          )}
        />
        {!sidebarCollapsed && (
          <span className="relative truncate">{route.label}</span>
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
  };

  const primaryRoutes = routes.filter((route) => route.group !== "footer");
  const footerRoutes = routes.filter((route) => route.group === "footer");

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2.5 pt-1.5">
      {primaryRoutes.map(renderRoute)}
    </nav>
  );

  // Inset hairline divider (not full-bleed) so it doesn't collide with the
  // floating card's rounded corners.
  const footerNav = footerRoutes.length ? (
    <div className="shrink-0 px-3 pb-2.5">
      <div className="mb-2 h-px bg-border/70" aria-hidden="true" />
      <nav className="space-y-0.5">{footerRoutes.map(renderRoute)}</nav>
    </div>
  ) : null;

  // Shared styling for the floating-sidebar collapse/expand toggle so both
  // states render an identical control (only the icon + position differ).
  const toggleButtonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-fast hover:bg-muted hover:text-foreground active:bg-muted focus-visible:shadow-ring";

  // ── macOS: floating sidebar ───────────────────────────────────────────────
  // An inset card with rounded corners and a shadow. The native traffic lights
  // are inset (see `position_traffic_lights` in src-tauri/src/lib.rs) so they
  // sit inside the card's header. The collapse toggle lives in that header too.
  if (isMac) {
    return (
      <div className="app-canvas flex h-screen overflow-hidden text-foreground">
        <aside
          className={cn(
            "m-2 flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-surface shadow-card",
            "motion-safe:transition-[width] motion-safe:duration-normal",
            // Collapsed stays wide enough to hold the native traffic lights.
            sidebarCollapsed ? "w-[84px]" : "w-[224px]"
          )}
        >
          {/* Header: a drag region that also clears the native traffic lights
              (top-left). px-3 lines the collapse toggle up with the nav rows
              below. The toggle sits at the right when expanded. */}
          <div className="relative flex h-11 shrink-0 items-center justify-end px-3">
            <div
              data-tauri-drag-region
              className="absolute inset-0"
              aria-hidden="true"
            />
            {!sidebarCollapsed && (
              <Tooltip content="Collapse sidebar" side="bottom">
                <button
                  type="button"
                  aria-label="Collapse sidebar"
                  aria-expanded
                  onClick={toggleSidebar}
                  className={cn(toggleButtonClass, "relative z-10")}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>

          {/* When collapsed, the expand toggle drops just below the lights. */}
          {sidebarCollapsed && (
            <div className="flex shrink-0 justify-center pb-1">
              <Tooltip content="Expand sidebar" side="right">
                <button
                  type="button"
                  aria-label="Expand sidebar"
                  aria-expanded={false}
                  onClick={toggleSidebar}
                  className={toggleButtonClass}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          )}

          {brand}
          {nav}
          {footerNav}
        </aside>

        {/* Main column: its own slim drag strip keeps the window draggable. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div data-tauri-drag-region className="h-9 shrink-0" aria-hidden="true" />
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
        </div>

        {rightRail}
      </div>
    );
  }

  // ── Windows / other: classic flush sidebar ─────────────────────────────────
  return (
    <div className="app-canvas flex h-screen flex-col overflow-hidden text-foreground">
      {/* One full-width drag region across the very top. No interactive
          children, so dragging can never trigger a click. */}
      <div data-tauri-drag-region className="h-9 shrink-0" aria-hidden="true" />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur-sm",
            "motion-safe:transition-[width] motion-safe:duration-normal",
            sidebarCollapsed ? "w-[60px]" : "w-[224px]"
          )}
        >
          {brand}
          {nav}
          {footerNav}

          {/* Collapse toggle */}
          <div className="shrink-0 border-t border-border p-3">
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
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground outline-none",
                  "transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:shadow-ring",
                  sidebarCollapsed && "justify-center"
                )}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                ) : (
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                )}
                {!sidebarCollapsed && <span>Collapse</span>}
              </button>
            </Tooltip>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>

        {rightRail}
      </div>
    </div>
  );
}
