import { Bell, Bot, Brain, SlidersHorizontal, Sparkles } from "lucide-react";
import { AI_LANGUAGES } from "../../../services/ai/languages";
import { DEFAULT_SOUL } from "../../../services/ai/assistant/soul";
import { planProviderFieldChange } from "../../../services/ai/credentials";
import { DEFAULT_MODELS, resolveModel } from "../../../services/ai/providers";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { PermissionLevel } from "../../../services/ai/assistant/agentTools/types";
import { Field, Input, Select, Textarea } from "../../ui/Field";
import { SettingsSection } from "../../ui/PageHeader";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { AiProviderFields } from "../AiProviderFields";
import { MemoryManager } from "../MemoryManager";
import { ModelPicker } from "../ModelPicker";
import { SettingRow } from "../controls";

const PERMISSION_SEGMENTS: { value: PermissionLevel; label: string; icon: typeof SlidersHorizontal }[] = [
  { value: "plan", label: "Plan", icon: SlidersHorizontal },
  { value: "ask", label: "Ask", icon: Bell },
  { value: "auto", label: "Auto", icon: Sparkles }
];

export function AssistantSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  // `aiProviderConfigs` rides along so a catalog lookup can name the account a
  // signed-in token belongs to, and can renew that token when it has expired.
  const aiSettings = {
    aiProvider: settings.aiProvider,
    aiApiKey: settings.aiApiKey,
    aiModel: settings.aiModel,
    aiBaseUrl: settings.aiBaseUrl,
    aiProviderConfigs: settings.aiProviderConfigs
  };

  return (
    <div className="grid gap-4">
      <SettingsSection
        icon={Sparkles}
        title="Provider"
        description="Choose who answers, and sign in or bring your own API key. Your credentials are only ever sent to the provider you pick."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AiProviderFields />
          <ModelPicker
            label="Model"
            settings={aiSettings}
            value={settings.aiModel}
            onChange={(model) =>
              void updateSettings(planProviderFieldChange(settings, "aiModel", model))
            }
            emptyLabel={
              DEFAULT_MODELS[settings.aiProvider]
                ? `Default (${DEFAULT_MODELS[settings.aiProvider]})`
                : "Not set — pick a model your endpoint serves"
            }
          />
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
            <div className="max-w-[12rem] pb-1">
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
        icon={Bot}
        title="Assistant"
        description="Shape who your assistant is, what it knows about you, and how much it can do on its own."
      >
        <div className="space-y-4">
          <Field label="Assistant name" hint="What your assistant is called.">
            <Input
              type="text"
              placeholder="Yolo Assistant"
              value={settings.assistantName}
              onChange={(event) => void updateSetting("assistantName", event.target.value)}
            />
          </Field>
          <div>
            <Field
              label="Soul"
              hint="Defines who your assistant is and how it behaves — its identity, voice, and boundaries. Leave blank to use the default."
            >
              <Textarea
                rows={10}
                placeholder={DEFAULT_SOUL}
                value={settings.assistantSoul}
                onChange={(event) => void updateSetting("assistantSoul", event.target.value)}
                className="resize-y font-mono text-xs"
              />
            </Field>
            <button
              type="button"
              onClick={() => void updateSetting("assistantSoul", DEFAULT_SOUL)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Reset to default soul
            </button>
          </div>
          <Field
            label="About me"
            hint="About you — the assistant reads this to tailor its work to your role, projects, hours, and goals."
          >
            <Textarea
              rows={4}
              placeholder="e.g. I'm a product manager relocating to Tokyo. Mornings are for deep work; I keep meetings after 2pm. Current focus: the Q3 launch and learning Japanese."
              value={settings.assistantProfile}
              onChange={(event) => void updateSetting("assistantProfile", event.target.value)}
              className="resize-y"
            />
          </Field>
          <Field label="Autonomy" hint="Plan proposes changes, Ask confirms each change, Auto applies reversible changes.">
            <SegmentedControl
              segments={PERMISSION_SEGMENTS}
              value={settings.assistantPermissionLevel}
              onChange={(level) => void updateSetting("assistantPermissionLevel", level)}
              className="justify-self-start"
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Brain}
        title="Memory"
        description="Let the assistant remember durable facts about you between conversations."
      >
        <SettingRow
          label="Self-curated memory"
          hint="Learn from your conversations and recall what matters in future chats."
          value={settings.assistantMemoryEnabled}
          onChange={(value) => void updateSetting("assistantMemoryEnabled", value)}
        />
        <div className="mt-1 space-y-4 border-t border-border pt-4">
          {settings.assistantMemoryEnabled ? (
            <ModelPicker
              label="Memory model (optional)"
              settings={aiSettings}
              value={settings.assistantMemoryModel}
              onChange={(model) => void updateSetting("assistantMemoryModel", model)}
              emptyLabel={
                resolveModel(aiSettings)
                  ? `Same as assistant (${resolveModel(aiSettings)})`
                  : "Same as assistant"
              }
              hint="A cheaper model keeps the background memory review cheap."
            />
          ) : null}
          <MemoryManager />
        </div>
      </SettingsSection>
    </div>
  );
}
