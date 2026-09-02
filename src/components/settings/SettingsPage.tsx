import { Bell, Bot, Coffee, MonitorCog, SlidersHorizontal, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { PageHeader } from "../ui/PageHeader";
import { TabBar, tabId, tabPanelId, type TabItem } from "../ui/Tabs";
import { AssistantSettings } from "./sections/AssistantSettings";
import { CategoriesSettings } from "./sections/CategoriesSettings";
import { GeneralSettings } from "./sections/GeneralSettings";
import { RestSettings } from "./sections/RestSettings";
import { SystemSettings } from "./sections/SystemSettings";

export type SettingsTab = "general" | "categories" | "rest" | "assistant" | "system";

const TABS: TabItem<SettingsTab>[] = [
  { value: "general", label: "General", icon: SlidersHorizontal },
  { value: "categories", label: "Categories", icon: Tags },
  { value: "rest", label: "Rest", icon: Coffee },
  { value: "assistant", label: "Assistant", icon: Bot },
  { value: "system", label: "System", icon: Bell }
];

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.value));
const STORAGE_TAB = "fl:settingsTab";
const ID_BASE = "settings";

function readStoredTab(): SettingsTab {
  try {
    const raw = localStorage.getItem(STORAGE_TAB);
    if (raw && TAB_IDS.has(raw)) return raw as SettingsTab;
  } catch {
    // Ignore: a blocked storage just means we start on the first tab.
  }
  return "general";
}

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>(readStoredTab);
  const requestedTab = useUiStore((state) => state.requestedSettingsTab);
  const clearRequestedTab = useUiStore((state) => state.clearRequestedSettingsTab);

  // Deep links (e.g. the assistant's "Add your API key") land on their tab
  // instead of the page top, then clear so it only fires once.
  useEffect(() => {
    if (requestedTab && TAB_IDS.has(requestedTab)) {
      setTab(requestedTab as SettingsTab);
    }
    if (requestedTab) clearRequestedTab();
  }, [requestedTab, clearRequestedTab]);

  // Remember the last tab so returning to Settings resumes where you left.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TAB, tab);
    } catch {
      // Ignore: remembering the tab is a convenience, not a requirement.
    }
  }, [tab]);

  return (
    <div className="page-scroll px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          icon={MonitorCog}
          eyebrow="Settings"
          title="Preferences"
          description="Tune how Yolo plans, tracks, and reflects on your time."
        />

        <TabBar
          idBase={ID_BASE}
          label="Settings sections"
          tabs={TABS}
          value={tab}
          onChange={setTab}
          className="mb-5"
        />

        <div
          role="tabpanel"
          id={tabPanelId(ID_BASE, tab)}
          aria-labelledby={tabId(ID_BASE, tab)}
          tabIndex={-1}
        >
          {tab === "general" ? (
            <GeneralSettings />
          ) : tab === "categories" ? (
            <CategoriesSettings />
          ) : tab === "rest" ? (
            <RestSettings />
          ) : tab === "assistant" ? (
            <AssistantSettings />
          ) : (
            <SystemSettings />
          )}
        </div>
      </div>
    </div>
  );
}
