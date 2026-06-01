import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[72px_1fr] lg:grid-cols-[220px_1fr]">
        <aside className="border-r bg-muted/40 px-2 py-5 lg:px-4">
          <div className="mb-8 hidden lg:block">
            <h1 className="text-lg font-semibold tracking-normal">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <nav className="space-y-1">
            {routes.map((route) => {
              const Icon = route.icon;
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onRouteChange(route.id)}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-left text-sm transition lg:justify-start",
                    activeRoute === route.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  )}
                  aria-label={route.label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{route.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
