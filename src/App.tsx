import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, BarChart3, CalendarDays, CheckSquare, Hourglass, Inbox, Info, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AboutPage } from "./components/about/AboutPage";
import { AssistantDock } from "./components/assistant/AssistantDock";
import { AssistantLauncher } from "./components/assistant/AssistantLauncher";
import { BacklogPage } from "./components/backlog/BacklogPage";
import { HistoryPage } from "./components/history/HistoryPage";
import { AppShell } from "./components/layout/AppShell";
import { WindowFrame } from "./components/layout/WindowFrame";
import { LifePage } from "./components/life/LifePage";
import { MyDayPage } from "./components/myday/MyDayPage";
import { PlanPage } from "./components/plan/PlanPage";
import { QuickAddDialog } from "./components/quick-add/QuickAddDialog";
import { SettingsPage } from "./components/settings/SettingsPage";
import { FocusZenOverlay } from "./components/today/FocusZenOverlay";
import { RestOverlay } from "./components/today/RestOverlay";
import { TodayPage } from "./components/today/TodayPage";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { SkeletonList } from "./components/ui/Skeleton";
import { ToastViewport } from "./components/ui/ToastViewport";
import { TooltipProvider } from "./components/ui/Tooltip";
import { useAmbientAudio } from "./hooks/useAmbientAudio";
import { useAssistantShortcut } from "./hooks/useAssistantShortcut";
import { useDayRollover } from "./hooks/useDayRollover";
import { useDebriefSchedule } from "./hooks/useDebriefSchedule";
import { useExternalDataRefresh } from "./hooks/useExternalDataRefresh";
import { useNotificationPermissionPrompt } from "./hooks/useNotificationPermission";
import { useQuickAddShortcuts } from "./hooks/useQuickAddShortcuts";
import { useTaskReminders } from "./hooks/useTaskReminders";
import { useTrayMenu } from "./hooks/useTrayMenu";
import { useTrayStatus } from "./hooks/useTrayStatus";
import { ensureNotifyCenter } from "./notify/notifyCenter";
import { useAssistantStore } from "./stores/assistantStore";
import { useRestStore } from "./stores/restStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";
import { useUiStore } from "./stores/uiStore";
import { settle } from "./utils/motion";
import { applyTheme } from "./utils/theme";

type RouteId =
  | "today"
  | "my-day"
  | "backlog"
  | "plan"
  | "life"
  | "history"
  | "settings"
  | "about";

const routes = [
  { id: "today" as const, label: "Today", icon: CheckSquare },
  { id: "my-day" as const, label: "My Day", icon: Sparkles },
  { id: "backlog" as const, label: "Backlog", icon: Inbox },
  { id: "plan" as const, label: "Plan", icon: CalendarDays },
  { id: "life" as const, label: "Life", icon: Hourglass },
  { id: "history" as const, label: "History", icon: BarChart3 },
  { id: "settings" as const, label: "Settings", icon: Settings, group: "footer" as const },
  { id: "about" as const, label: "About", icon: Info, group: "footer" as const }
];

const ROUTE_IDS = new Set<string>(routes.map((entry) => entry.id));

export default function App() {
  const [route, setRoute] = useState<RouteId>("today");
  const initialize = useTaskStore((state) => state.initialize);
  const initialized = useTaskStore((state) => state.initialized);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const theme = useSettingsStore((state) => state.settings.theme);
  const requestedRoute = useUiStore((state) => state.requestedRoute);
  const clearRequestedRoute = useUiStore((state) => state.clearRequestedRoute);
  const focusZen = useUiStore((state) => state.focusZen);
  const restZen = useUiStore((state) => state.restZen);
  const resting = useRestStore((state) => Boolean(state.rest));
  const reduceMotion = useReducedMotion();
  const openToday = useCallback(() => setRoute("today"), []);

  // While a full-screen overlay (zen focus / rest) is up, the shell behind it
  // is decoration: make it inert so Tab and screen readers can't reach it. A
  // *minimized* rest (running behind its card) leaves the shell interactive.
  // Attribute (not prop) keeps this compatible with React 18's typings.
  const overlayActive = focusZen || (resting && restZen);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    shellRef.current?.toggleAttribute("inert", overlayActive);
  }, [overlayActive]);

  useTrayStatus();
  useTrayMenu();
  useQuickAddShortcuts();
  useNotificationPermissionPrompt();
  useTaskReminders({ onOpenToday: openToday });
  useDayRollover();
  useExternalDataRefresh();
  useDebriefSchedule();
  useAssistantShortcut();
  // Single owner of the ambient mixer — outlives both focus surfaces.
  useAmbientAudio();

  useEffect(() => {
    void initialize();
    void useAssistantStore.getState().hydrate();
    void useRestStore.getState().hydrate();
  }, [initialize]);

  // Wire the fullscreen notification action listeners once, so their buttons
  // route back to the real handlers in this (main) webview.
  useEffect(() => {
    void ensureNotifyCenter();
  }, []);

  // Apply cross-component navigation requests (e.g. the Today "My Day" button
  // or the scheduled-debrief toast), then clear so it fires once.
  useEffect(() => {
    if (requestedRoute && ROUTE_IDS.has(requestedRoute)) {
      setRoute(requestedRoute as RouteId);
    }
    if (requestedRoute) {
      clearRequestedRoute();
    }
  }, [requestedRoute, clearRequestedRoute]);

  // Paints the theme on the web layer *and* the native window, and — while the
  // setting is "System" — keeps following the OS as it changes.
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <TooltipProvider>
      <div ref={shellRef} className="contents">
      <AppShell
        routes={routes}
        activeRoute={route}
        onRouteChange={setRoute}
        title="Yolo"
        subtitle="Make your time count."
        rightRail={<AssistantDock />}
      >
        {!initialized && loading ? (
          <div className="page-scroll p-6">
            <SkeletonList count={4} />
          </div>
        ) : error ? (
          // `page-scroll` so a long startup error can still be read: the
          // content region clips, and these two branches are the only children
          // of it that are not a route root.
          <div className="page-scroll px-6">
            <div className="mx-auto mt-20 max-w-xl rounded-xl border border-destructive/30 bg-destructive-soft p-5">
              <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                <AlertCircle className="h-4 w-4" />
                Yolo could not start
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          // Keyed by route: a barely-there fade with a 4px rise. This is the
          // *only* entrance layer on navigation — inner panes and lists stay
          // still so the page reads as one calm surface, not stacked effects.
          <motion.div
            key={route}
            className="h-full"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...settle, duration: 0.2 }}
          >
            {route === "today" ? (
              <TodayPage />
            ) : route === "my-day" ? (
              <MyDayPage />
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
          </motion.div>
        )}
      </AppShell>
      <AssistantLauncher />
      </div>
      {/* Outside the inert wrapper on purpose: the window's own buttons must
          keep working while a zen overlay makes the shell behind it inert. */}
      <WindowFrame overlayActive={overlayActive} />
      <FocusZenOverlay />
      <RestOverlay />
      <QuickAddDialog />
      <ConfirmDialog />
      <ToastViewport />
    </TooltipProvider>
  );
}
