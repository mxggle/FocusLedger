import { Bell, Keyboard, MonitorCog } from "lucide-react";
import { ChangeEvent } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { AppTheme } from "../../types";
import { Field, Input, Select } from "../ui/Field";
import { Switch } from "../ui/Switch";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const categories = useTaskStore((state) => state.categories);

  function updateNumber(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    void updateSetting("dailyFocusTargetMinutes", Number.isFinite(value) ? value : 240);
  }

  return (
    <div className="h-screen overflow-y-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MonitorCog className="h-4 w-4" />
          Settings
        </div>
        <h2 className="mt-1 text-2xl font-semibold">Local preferences</h2>
      </div>

      <div className="grid max-w-3xl gap-4">
        <section className="rounded-md border bg-background p-4">
          <h3 className="text-sm font-semibold">Defaults</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Default category">
              <Select
                value={settings.defaultCategoryId}
                onChange={(event) => void updateSetting("defaultCategoryId", event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Daily focus target">
              <Input type="number" min="0" value={settings.dailyFocusTargetMinutes} onChange={updateNumber} />
            </Field>
            <Field label="Theme">
              <Select value={settings.theme} onChange={(event) => void updateSetting("theme", event.target.value as AppTheme)}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
          </div>
        </section>

        <section className="rounded-md border bg-background p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            Desktop behavior
          </h3>
          <div className="mt-4 grid gap-4">
            <SettingRow
              label="Start week on Monday"
              value={settings.startWeekOnMonday}
              onChange={(value) => void updateSetting("startWeekOnMonday", value)}
            />
            <SettingRow
              label="Enable tray"
              value={settings.enableTray}
              onChange={(value) => void updateSetting("enableTray", value)}
            />
            <SettingRow
              label="Enable notifications"
              value={settings.enableNotifications}
              onChange={(value) => void updateSetting("enableNotifications", value)}
            />
          </div>
        </section>

        <section className="rounded-md border bg-background p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="h-4 w-4" />
            Global shortcut
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">Use Cmd/Ctrl+K inside the app. The global shortcut works while FocusLedger is running.</p>
          <div className="mt-4 max-w-sm">
            <Field label="Shortcut">
              <Input
                value={settings.globalShortcut}
                onChange={(event) => void updateSetting("globalShortcut", event.target.value)}
              />
            </Field>
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onChange={onChange} />
    </div>
  );
}
