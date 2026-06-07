import { AlertCircle, BarChart3, CalendarDays, CheckSquare, Hourglass, Inbox, Info, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AboutPage } from "./components/about/AboutPage";
import { BacklogPage } from "./components/backlog/BacklogPage";
import { HistoryPage } from "./components/history/HistoryPage";
import { AppShell } from "./components/layout/AppShell";
import { LifePage } from "./components/life/LifePage";
import { PlanPage } from "./components/plan/PlanPage";
import { QuickAddDialog } from "./components/quick-add/QuickAddDialog";
import { SettingsPage } from "./components/settings/SettingsPage";
import { FocusZenOverlay } from "./components/today/FocusZenOverlay";
import { TodayPage } from "./components/today/TodayPage";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { SkeletonList } from "./components/ui/Skeleton";
import { ToastViewport } from "./components/ui/ToastViewport";
import { TooltipProvider } from "./components/ui/Tooltip";
import { useDayRollover } from "./hooks/useDayRollover";
import { useNotificationPermissionPrompt } from "./hooks/useNotificationPermission";
import { useQuickAddShortcuts } from "./hooks/useQuickAddShortcuts";
import { useTaskReminders } from "./hooks/useTaskReminders";
import { useTrayStatus } from "./hooks/useTrayStatus";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";

type RouteId =
  | "today"
  | "backlog"
  | "plan"
  | "life"
  | "history"
  | "settings"
  | "about";

const routes = [
  { id: "today" as const, label: "Today", icon: CheckSquare },
  { id: "backlog" as const, label: "Backlog", icon: Inbox },
  { id: "plan" as const, label: "Plan", icon: CalendarDays },
  { id: "life" as const, label: "Life", icon: Hourglass },
  { id: "history" as const, label: "History", icon: BarChart3 },
  { id: "settings" as const, label: "Settings", icon: Settings },
  { id: "about" as const, label: "About", icon: Info }
];

export default function App() {
  const [route, setRoute] = useState<RouteId>("today");
  const initialize = useTaskStore((state) => state.initialize);
  const initialized = useTaskStore((state) => state.initialized);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const theme = useSettingsStore((state) => state.settings.theme);
  const openToday = useCallback(() => setRoute("today"), []);

  useTrayStatus();
  useQuickAddShortcuts();
  useNotificationPermissionPrompt();
  useTaskReminders({ onOpenToday: openToday });
  useDayRollover();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle(
      "dark",
      theme === "dark" || (theme === "system" && prefersDark)
    );
  }, [theme]);

  return (
    <TooltipProvider>
      <AppShell
        routes={routes}
        activeRoute={route}
        onRouteChange={setRoute}
        title="Yolo"
        subtitle="Make your time count."
      >
        {!initialized && loading ? (
          <div className="p-6">
            <SkeletonList count={4} />
          </div>
        ) : error ? (
          <div className="mx-auto mt-20 max-w-xl rounded-xl border border-destructive/30 bg-destructive-soft p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" />
              Yolo could not start
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : route === "today" ? (
          <TodayPage onOpenLife={() => setRoute("life")} />
        ) : route === "backlog" ? (
          <BacklogPage />
        ) : route === "plan" ? (
          <PlanPage />
        ) : route === "life" ? (
          <LifePage onNavigate={setRoute} />
        ) : route === "history" ? (
          <HistoryPage />
        ) : route === "settings" ? (
          <SettingsPage />
        ) : (
          <AboutPage />
        )}
      </AppShell>
      <FocusZenOverlay />
      <QuickAddDialog />
      <ConfirmDialog />
      <ToastViewport />
    </TooltipProvider>
  );
}
