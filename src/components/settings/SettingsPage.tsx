import { Bell, Keyboard, MonitorCog, SlidersHorizontal, Tags } from "lucide-react";
import { ChangeEvent } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { AppTheme } from "../../types";
import { Field, Input, Select } from "../ui/Field";
import { PageHeader, SettingsSection } from "../ui/PageHeader";
import { Switch } from "../ui/Switch";
import { CategoryManager } from "./CategoryManager";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const categories = useTaskStore((state) => state.categories);

  function updateNumber(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    void updateSetting(
      "dailyFocusTargetMinutes",
      Number.isFinite(value) ? value : 240
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          icon={MonitorCog}
          eyebrow="Settings"
          title="Local preferences"
          description="Everything is stored on this device."
        />

        <div className="grid gap-5">
          <SettingsSection icon={SlidersHorizontal} title="Defaults">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default category">
                <Select
                  value={settings.defaultCategoryId}
                  onChange={(event) =>
                    void updateSetting("defaultCategoryId", event.target.value)
                  }
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Daily focus target"
                hint="Total focus minutes per day"
              >
                <Input
                  type="number"
                  min="0"
                  value={settings.dailyFocusTargetMinutes}
                  onChange={updateNumber}
                />
              </Field>
              <Field label="Theme">
                <Select
                  value={settings.theme}
                  onChange={(event) =>
                    void updateSetting("theme", event.target.value as AppTheme)
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </Select>
              </Field>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Tags}
            title="Categories"
            description="Organize tasks by area. Pick a color so they stand out across the app."
          >
            <CategoryManager />
          </SettingsSection>

          <SettingsSection icon={Bell} title="Desktop behavior">
            <div className="divide-y divide-border">
              <SettingRow
                label="Start week on Monday"
                value={settings.startWeekOnMonday}
                onChange={(value) =>
                  void updateSetting("startWeekOnMonday", value)
                }
              />
              <SettingRow
                label="Enable tray"
                hint="Keep FocusLedger in the menu bar / system tray."
                value={settings.enableTray}
                onChange={(value) => void updateSetting("enableTray", value)}
              />
              <SettingRow
                label="Enable notifications"
                hint="Get reminders when sessions and tasks need attention."
                value={settings.enableNotifications}
                onChange={(value) =>
                  void updateSetting("enableNotifications", value)
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Keyboard}
            title="Global shortcut"
            description="Use Cmd/Ctrl+K inside the app. The global shortcut works while FocusLedger is running."
          >
            <div className="max-w-sm">
              <Field label="Shortcut key">
                <Input
                  value={settings.globalShortcut}
                  onChange={(event) =>
                    void updateSetting("globalShortcut", event.target.value)
                  }
                />
              </Field>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <Switch checked={value} onChange={onChange} label={label} />
    </div>
  );
}
