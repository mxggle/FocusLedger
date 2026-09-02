import { SlidersHorizontal } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTaskStore } from "../../../stores/taskStore";
import type { AppTheme } from "../../../types";
import { Field, Select } from "../../ui/Field";
import { SettingsSection } from "../../ui/PageHeader";
import { DeferredNumberInput, SettingRow } from "../controls";

export function GeneralSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const categories = useTaskStore((state) => state.categories);

  return (
    <div className="grid gap-4">
      <SettingsSection icon={SlidersHorizontal} title="General">
        <div className="grid gap-4 sm:grid-cols-3">
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
          <Field
            label="Daily focus target"
            hint="Focus minutes per day"
          >
            <DeferredNumberInput
              min={0}
              fallback={240}
              value={settings.dailyFocusTargetMinutes}
              onCommit={(value) =>
                void updateSetting("dailyFocusTargetMinutes", value)
              }
            />
          </Field>
        </div>
        <div className="mt-4 border-t border-border pt-1">
          <SettingRow
            label="Start week on Monday"
            value={settings.startWeekOnMonday}
            onChange={(value) =>
              void updateSetting("startWeekOnMonday", value)
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
