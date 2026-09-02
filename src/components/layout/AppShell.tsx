import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useUiStore } from "../../stores/uiStore";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import { Sidebar, type SidebarRoute } from "./Sidebar";
import { TitleBar } from "./TitleBar";

/**
 * The application frame: title bar across the top, navigation rail and content
 * region below it.
 *
 * There is one layout for every platform now, rather than a macOS branch and a
 * Windows branch. What the two OSes actually disagree about is narrower than
 * it looks — where the window buttons go (`TitleBar` / `WindowControls`), how a
 * selected nav row is marked (`Sidebar`), and how the content region meets the
 * window edge (`.content-region` in `src/styles.css`) — and each of those now
 * lives with the thing it affects. The frame itself is shared.
 *
 * Structure:
 *
 *   app-canvas ................ the window material, or an opaque fallback
 *   ├─ TitleBar ............... full-width drag region + window buttons
 *   └─ row
 *      ├─ Sidebar ............. sits directly on the material
 *      └─ content-region ...... opaque sheet holding the page and right rail
 *
 * The sidebar being vibrant while the content is opaque is not decoration: it
 * is how both Finder and Windows Settings separate navigation from content,
 * and it keeps body text off a translucent background where it would be least
 * legible.
 */

type AppShellProps<T extends string> = {
  routes: SidebarRoute<T>[];
  activeRoute: T;
  onRouteChange: (route: T) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Docked rail rendered to the right of the page. As a flex sibling inside
   *  the content region it reflows the page instead of overlaying it — so the
   *  task list stays visible and interactive while the assistant is open. */
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

  const sidebarToggle = (
    <Tooltip
      content={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      side="bottom"
    >
      <IconButton
        icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
        label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        size="sm"
        variant="ghost"
        aria-expanded={!sidebarCollapsed}
        onClick={toggleSidebar}
      />
    </Tooltip>
  );

  return (
    <div className="app-canvas flex h-screen flex-col overflow-hidden text-foreground">
      <TitleBar title={title} leading={sidebarToggle} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          routes={routes}
          activeRoute={activeRoute}
          onRouteChange={onRouteChange}
          collapsed={sidebarCollapsed}
          tagline={subtitle}
        />

        {/* One sheet holds the page and the docked rail, so the rail's divider
            reads as an internal split rather than a second floating panel. */}
        <div className="content-region flex min-w-0 flex-1 overflow-hidden">
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          {rightRail}
        </div>
      </div>
    </div>
  );
}
