import { Bell, Bot, Brain, Eye, EyeOff, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { AI_LANGUAGES } from "../../../services/ai/languages";
import { DEFAULT_SOUL } from "../../../services/ai/assistant/soul";
import { DEFAULT_MODELS, PROVIDER_LABELS } from "../../../services/ai/providers";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { AiProvider } from "../../../types";
import type { PermissionLevel } from "../../../services/ai/assistant/agentTools/types";
import { Field, Input, Select, Textarea } from "../../ui/Field";
import { SettingsSection } from "../../ui/PageHeader";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { MemoryManager } from "../MemoryManager";
import { SettingRow } from "../controls";

const PERMISSION_SEGMENTS: { value: PermissionLevel; label: string; icon: typeof SlidersHorizontal }[] = [
  { value: "plan", label: "Plan", icon: SlidersHorizontal },
  { value: "ask", label: "Ask", icon: Bell },
  { value: "auto", label: "Auto", icon: Sparkles }
];

export function AssistantSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="grid gap-4">
      <SettingsSection
        icon={Sparkles}
        title="Provider"
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
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                placeholder="Paste your API key"
                value={settings.aiApiKey}
                onChange={(event) => void updateSetting("aiApiKey", event.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                title={showApiKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowApiKey((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
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
            <Field
              label="Memory model (optional)"
              hint="A cheaper model for the background memory review. Leave empty to reuse your assistant model."
            >
              <Input
                type="text"
                placeholder={settings.aiModel || DEFAULT_MODELS[settings.aiProvider] || "same as assistant"}
                value={settings.assistantMemoryModel}
                onChange={(event) => void updateSetting("assistantMemoryModel", event.target.value)}
              />
            </Field>
          ) : null}
          <MemoryManager />
        </div>
      </SettingsSection>
    </div>
  );
}
