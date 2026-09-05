import { Coffee } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { RestAfterTask } from "../../../types";
import { Field } from "../../ui/Field";
import { SettingsSection } from "../../ui/PageHeader";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { DeferredNumberInput, SettingRow } from "../controls";

const REST_AFTER_TASK_SEGMENTS: { value: RestAfterTask; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "ask", label: "Ask" },
  { value: "auto", label: "Auto" }
];

export function RestSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <div className="grid gap-4">
      <SettingsSection
        icon={Coffee}
        title="Rest"
        description="Breaks help your time count. Rest is never tracked as a task — it stays out of your stats and shows in the log only as a calm marker."
      >
        <SettingRow
          label="Enable rest"
          hint="Show the “Take a break” action and allow breaks after finishing a task."
          value={settings.restEnabled}
          onChange={(value) => void updateSetting("restEnabled", value)}
        />
        {settings.restEnabled ? (
          <div className="mt-1 space-y-4 border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default break length" hint="Minutes per break">
                <DeferredNumberInput
                  min={1}
                  max={120}
                  fallback={5}
                  value={settings.restDefaultMinutes}
                  onCommit={(value) =>
                    void updateSetting("restDefaultMinutes", value)
                  }
                />
              </Field>
              <Field
                label="Minimum session to offer a break"
                hint="Skip the break prompt after very short sessions"
              >
                <DeferredNumberInput
                  min={0}
                  max={240}
                  fallback={15}
                  value={settings.restAfterTaskMinSessionMinutes}
                  onCommit={(value) =>
                    void updateSetting("restAfterTaskMinSessionMinutes", value)
                  }
                />
              </Field>
            </div>
            <Field
              label="After finishing a task"
              hint="Off does nothing; Ask offers a break; Auto opens the rest screen."
            >
              <SegmentedControl
                segments={REST_AFTER_TASK_SEGMENTS}
                value={settings.restAfterTask}
                onChange={(value) => void updateSetting("restAfterTask", value)}
                className="justify-self-start"
              />
            </Field>
          </div>
        ) : null}
      </SettingsSection>
    </div>
  );
}
