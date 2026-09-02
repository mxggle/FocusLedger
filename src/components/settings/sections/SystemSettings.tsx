import { Bell, Keyboard } from "lucide-react";
import { useNotificationPermission } from "../../../hooks/useNotificationPermission";
import { showStyledNotification } from "../../../notify/notifyCenter";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUiStore } from "../../../stores/uiStore";
import type { NotificationStyle } from "../../../types";
import { sendTestNotification } from "../../../utils/notificationPermission";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Field, Select } from "../../ui/Field";
import { SettingsSection } from "../../ui/PageHeader";
import { ShortcutInput } from "../../ui/ShortcutInput";
import { SettingRow } from "../controls";

export function SystemSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const notificationPermission = useNotificationPermission();
  const addToast = useUiStore((state) => state.addToast);

  async function enableSystemNotifications() {
    const result = await notificationPermission.request();
    // If the OS won't re-prompt (already denied), send the user to settings.
    if (result !== "granted") {
      await notificationPermission.openSettings();
    }
  }

  async function testNotification() {
    const style = settings.notificationStyle;

    // Full-screen renders in its own window; preview it directly so the user
    // sees exactly what a real reminder looks like.
    if (style === "fullscreen") {
      try {
        await showStyledNotification(style, {
          kind: "info",
          title: "Time's up",
          description: "This is a full-screen reminder. Pick how you want to continue.",
          actions: [
            { label: "Continue", variant: "primary", onClick: () => {} },
            { label: "Open Yolo", variant: "secondary", onClick: () => void notificationPermission.refresh() }
          ]
        });
        addToast({
          kind: "success",
          title: "Test full-screen shown",
          description: "If no window appeared, run the desktop app (yarn tauri dev)."
        });
      } catch (error) {
        addToast({
          kind: "error",
          title: "Could not show the notification window",
          description: error instanceof Error ? error.message : "Run the desktop app to test this style."
        });
      }
      return;
    }

    const result = await sendTestNotification();
    // Re-read permission so the indicator above reflects any prompt just shown.
    await notificationPermission.refresh();

    if (result === "sent") {
      addToast({
        kind: "success",
        title: "Test notification sent",
        description: "Check your desktop. If no banner appeared, review your OS notification settings."
      });
    } else if (result === "denied") {
      addToast({
        kind: "error",
        title: "Notifications are blocked",
        description: "Your OS hasn't allowed Yolo to show notifications. Allow them, then try again.",
        actions: notificationPermission.canOpenSettings
          ? [
              {
                label: "Open settings",
                variant: "primary",
                onClick: () => void notificationPermission.openSettings()
              }
            ]
          : undefined
      });
    } else {
      addToast({
        kind: "error",
        title: "Notifications unavailable",
        description: "This environment can't show desktop notifications. Run the desktop app to test them."
      });
    }
  }

  return (
    <div className="grid gap-4">
      <SettingsSection icon={Bell} title="Notifications & tray">
        <div className="divide-y divide-border">
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
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Notification style
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  How reminders reach you: a system banner or a full-screen
                  alert.
                </div>
              </div>
              <div className="w-44 shrink-0">
                <Select
                  value={settings.notificationStyle}
                  onChange={(event) =>
                    void updateSetting(
                      "notificationStyle",
                      event.target.value as NotificationStyle
                    )
                  }
                >
                  <option value="system">System notification</option>
                  <option value="fullscreen">Full screen</option>
                </Select>
              </div>
            </div>
          ) : null}
          {settings.enableNotifications && settings.notificationStyle === "system" ? (
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
          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                Test notification
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Send a sample desktop banner to confirm notifications reach you.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void testNotification()}
            >
              Send test
            </Button>
          </div>
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
  );
}
