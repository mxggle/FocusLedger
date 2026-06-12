import { Bell, Keyboard, MonitorCog, SlidersHorizontal, Sparkles, Tags } from "lucide-react";
import { ChangeEvent } from "react";
import { useNotificationPermission } from "../../hooks/useNotificationPermission";
import { AI_LANGUAGES } from "../../services/ai/languages";
import { DEFAULT_MODELS, PROVIDER_LABELS } from "../../services/ai/providers";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { AiProvider, AppTheme } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";
import { PageHeader, SettingsSection } from "../ui/PageHeader";
import { ShortcutInput } from "../ui/ShortcutInput";
import { Switch } from "../ui/Switch";
import { CategoryManager } from "./CategoryManager";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const categories = useTaskStore((state) => state.categories);
  const notificationPermission = useNotificationPermission();

  function updateNumber(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    void updateSetting(
      "dailyFocusTargetMinutes",
      Number.isFinite(value) ? value : 240
    );
  }

  async function enableSystemNotifications() {
    const result = await notificationPermission.request();
    // If the OS won't re-prompt (already denied), send the user to settings.
    if (result !== "granted") {
      await notificationPermission.openSettings();
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          icon={MonitorCog}
          eyebrow="Settings"
          title="Preferences"
          description="Tune how Yolo plans, tracks, and reflects on your time."
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
            icon={Sparkles}
            title="AI"
            description="Bring your own API key to power AI features like the daily debrief. Your key is only sent to the provider you choose."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider">
                <Select
                  value={settings.aiProvider}
                  onChange={(event) =>
                    void updateSetting("aiProvider", event.target.value as AiProvider)
                  }
                >
                  {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="API key">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your API key"
                  value={settings.aiApiKey}
                  onChange={(event) => void updateSetting("aiApiKey", event.target.value)}
                />
              </Field>
              <Field
                label="Model"
                hint={
                  DEFAULT_MODELS[settings.aiProvider]
                    ? `Leave empty for ${DEFAULT_MODELS[settings.aiProvider]}`
                    : "Model ID served by your endpoint"
                }
              >
                <Input
                  type="text"
                  placeholder={DEFAULT_MODELS[settings.aiProvider] || "e.g. llama3"}
                  value={settings.aiModel}
                  onChange={(event) => void updateSetting("aiModel", event.target.value)}
                />
              </Field>
              {settings.aiProvider === "custom" ? (
                <Field
                  label="Base URL"
                  hint="OpenAI-compatible endpoint, e.g. http://localhost:11434/v1"
                >
                  <Input
                    type="text"
                    placeholder="https://your-endpoint/v1"
                    value={settings.aiBaseUrl}
                    onChange={(event) => void updateSetting("aiBaseUrl", event.target.value)}
                  />
                </Field>
              ) : null}
              <Field
                label="Output language"
                hint="The language AI features write in, e.g. the daily debrief"
              >
                <Select
                  value={settings.aiLanguage}
                  onChange={(event) => void updateSetting("aiLanguage", event.target.value)}
                >
                  {AI_LANGUAGES.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-4 border-t border-border pt-1">
              <SettingRow
                label="Automatic daily debrief"
                hint="Generate the debrief on a schedule and notify you when it's ready."
                value={settings.debriefAutoEnabled}
                onChange={(value) => void updateSetting("debriefAutoEnabled", value)}
              />
              {settings.debriefAutoEnabled ? (
                <div className="max-w-[12rem] pb-3">
                  <Field label="Debrief time" hint="Local time, every day">
                    <Input
                      type="time"
                      value={settings.debriefAutoTime}
                      onChange={(event) =>
                        void updateSetting("debriefAutoTime", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}
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
                hint="Keep Yolo in the menu bar / system tray."
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
              {settings.enableNotifications ? (
                <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        System permission
                      </span>
                      {notificationPermission.status === "granted" ? (
                        <Badge variant="success" dot>
                          Granted
                        </Badge>
                      ) : (
                        <Badge variant="warning" dot>
                          Not granted
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {notificationPermission.status === "granted"
                        ? "Your OS allows Yolo to show desktop notifications."
                        : "Your OS hasn't allowed Yolo to show notifications. Until you grant it, reminders only appear inside the app."}
                    </div>
                  </div>
                  {notificationPermission.status !== "granted" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void enableSystemNotifications()}
                    >
                      Allow notifications
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Keyboard}
            title="Global shortcut"
            description="Quick-add shortcut used both inside the app and system-wide while Yolo is running."
          >
            <div className="max-w-sm">
              <Field label="Shortcut key">
                <ShortcutInput
                  value={settings.globalShortcut}
                  onChange={(value) => void updateSetting("globalShortcut", value)}
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
