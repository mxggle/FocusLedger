import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import { settle } from "../../utils/motion";
import { isMac } from "../../utils/platform";
import { Tooltip } from "../ui/Tooltip";

/**
 * The navigation rail.
 *
 * One implementation for every platform. It sits directly on the window
 * material (vibrancy on macOS, Mica on Windows) the way Finder's and Windows
 * Settings' nav panes both do, and falls back to a plain surface wherever no
 * material is available — see `.sidebar-surface` in `src/styles.css`.
 *
 * The platform difference is deliberately small and lives only in the
 * *selected* state, because that is the one piece of nav chrome the two OSes
 * genuinely draw differently:
 *
 *   macOS    a filled capsule behind the row, and nothing else.
 *   Windows  a filled row plus the Fluent selection bar — a short accent pill
 *            hugging the leading edge.
 *
 * The fill is a single shared element that glides between rows (`layoutId`),
 * so navigating animates one object rather than cross-fading two.
 */

export type SidebarRoute<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** "footer" pins the route to the meta section at the bottom (Settings,
   *  About), keeping the day-to-day destinations together up top. */
  group?: "footer";
};

type SidebarProps<T extends string> = {
  routes: SidebarRoute<T>[];
  activeRoute: T;
  onRouteChange: (route: T) => void;
  collapsed: boolean;
  /** The product throughline, shown under the nav when there is room. */
  tagline?: string;
};

export function Sidebar<T extends string>({
  routes,
  activeRoute,
  onRouteChange,
  collapsed,
  tagline
}: SidebarProps<T>) {
  const reduceMotion = useReducedMotion();

  const renderRoute = (route: SidebarRoute<T>) => {
    const Icon = route.icon;
    const active = activeRoute === route.id;

    const button = (
      <button
        type="button"
        onClick={() => onRouteChange(route.id)}
        aria-label={route.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium outline-none",
          "transition-colors duration-fast focus-visible:shadow-ring",
          collapsed && "justify-center px-0",
          active
            ? "text-primary-soft-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-fill"
            className="absolute inset-0 rounded-lg bg-primary-soft"
            // `settle`, shortened: the fill glides and stops dead. No bounce —
            // arrival in this app never overshoots.
            transition={reduceMotion ? { duration: 0 } : { ...settle, duration: 0.25 }}
            aria-hidden="true"
          />
        )}

        {/* Fluent selection bar. Windows marks the selected nav item with an
            accent pill on the leading edge; macOS uses the fill alone. */}
        {active && !isMac && (
          <motion.span
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary"
            transition={reduceMotion ? { duration: 0 } : { ...settle, duration: 0.25 }}
            aria-hidden="true"
          />
        )}

        <Icon className="relative h-4 w-4 shrink-0" />
        {!collapsed && <span className="relative truncate">{route.label}</span>}
      </button>
    );

    // Collapsed rows are icon-only, so the label has to come back as a tooltip.
    return collapsed ? (
      <Tooltip key={route.id} content={route.label} side="right">
        {button}
      </Tooltip>
    ) : (
      <div key={route.id}>{button}</div>
    );
  };

  const primaryRoutes = routes.filter((route) => route.group !== "footer");
  const footerRoutes = routes.filter((route) => route.group === "footer");

  return (
    <aside
      className={cn(
        "sidebar-surface flex shrink-0 flex-col overflow-hidden",
        "motion-safe:transition-[width] motion-safe:duration-normal",
        collapsed ? "w-[64px]" : "w-[232px]"
      )}
    >
      <nav
        aria-label="Primary"
        className={cn("flex-1 space-y-0.5 overflow-y-auto pb-2", collapsed ? "px-2" : "px-3")}
      >
        {primaryRoutes.map(renderRoute)}
      </nav>

      {tagline && !collapsed && (
        <p className="shrink-0 px-3 pb-2 text-[11px] leading-snug text-subtle">
          {tagline}
        </p>
      )}

      {footerRoutes.length > 0 && (
        <div className={cn("shrink-0 pb-3", collapsed ? "px-2" : "px-3")}>
          {/* Inset hairline: full-bleed would collide with the window's own
              rounded corner on Windows. */}
          <div className="mb-2 h-px bg-border/70" aria-hidden="true" />
          <nav aria-label="Settings" className="space-y-0.5">
            {footerRoutes.map(renderRoute)}
          </nav>
        </div>
      )}
    </aside>
  );
}
