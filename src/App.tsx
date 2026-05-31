import { BarChart3, CalendarDays, CheckSquare, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { HistoryPage } from "./components/history/HistoryPage";
import { AppShell } from "./components/layout/AppShell";
import { PlanPage } from "./components/plan/PlanPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { TodayPage } from "./components/today/TodayPage";
import { ToastViewport } from "./components/ui/ToastViewport";
import { useTrayStatus } from "./hooks/useTrayStatus";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";

type RouteId = "today" | "plan" | "history" | "settings";

const routes = [
  { id: "today" as const, label: "Today", icon: CheckSquare },
  { id: "plan" as const, label: "Plan", icon: CalendarDays },
  { id: "history" as const, label: "History", icon: BarChart3 },
  { id: "settings" as const, label: "Settings", icon: Settings }
];

export default function App() {
  const [route, setRoute] = useState<RouteId>("today");
  const initialize = useTaskStore((state) => state.initialize);
  const initialized = useTaskStore((state) => state.initialized);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const theme = useSettingsStore((state) => state.settings.theme);

  useTrayStatus();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
  }, [theme]);

  return (
    <>
      <AppShell
        routes={routes}
        activeRoute={route}
        onRouteChange={setRoute}
        title="FocusLedger"
        subtitle="Turn tasks into time records."
      >
        {!initialized && loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Initializing local SQLite database...
          </div>
        ) : error ? (
          <div className="mx-auto mt-20 max-w-xl rounded-md border border-destructive/40 bg-destructive/10 p-5 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
              <CalendarDays className="h-4 w-4" />
              FocusLedger could not start
            </div>
            <p className="text-muted-foreground">{error}</p>
          </div>
        ) : route === "today" ? (
          <TodayPage />
        ) : route === "plan" ? (
          <PlanPage />
        ) : route === "history" ? (
          <HistoryPage />
        ) : (
          <SettingsPage />
        )}
      </AppShell>
      <ToastViewport />
    </>
  );
}
