import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ban, Volume2, VolumeX, Waves } from "lucide-react";
import { useMemo } from "react";
import { SCENES } from "./scenes/registry";
import { normalizeAmbientSounds, SOUNDS } from "../../services/ambient/sounds";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";

/**
 * Atmosphere controls for a focus session: a scene picker, a per-layer sound
 * mixer, and master volume/mute — all driven by the SCENES/SOUNDS manifests, so
 * adding a scene or sound needs no edit here. Writes go through the quiet,
 * debounced `updateAmbient` so slider drags don't spam toasts or the DB.
 */
export function AmbientControls({
  align = "end",
  triggerClassName
}: {
  align?: "start" | "center" | "end";
  triggerClassName?: string;
}) {
  const reduce = useReducedMotion();
  const scene = useSettingsStore((state) => state.settings.ambientScene);
  const storedSounds = useSettingsStore((state) => state.settings.ambientSounds);
  const masterVolume = useSettingsStore((state) => state.settings.ambientMasterVolume);
  const muted = useSettingsStore((state) => state.settings.ambientMuted);
  const updateAmbient = useSettingsStore((state) => state.updateAmbient);

  const sounds = useMemo(() => normalizeAmbientSounds(storedSounds), [storedSounds]);
  const availability = useMemo(
    () => new Map(SOUNDS.map((sound) => [sound.id, sound.resolveSrc() !== undefined])),
    []
  );

  const active =
    scene !== "none" || Object.values(sounds).some((pref) => pref.enabled && !muted);

  const setSound = (id: string, next: { enabled: boolean; volume: number }) => {
    updateAmbient("ambientSounds", { ...sounds, [id]: next });
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Ambient scene & sound"
          title="Ambient scene & sound"
          className={cn(
            "relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:shadow-ring",
            active && "text-primary",
            triggerClassName
          )}
        >
          <Waves className="h-4 w-4" />
          {active ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          className="z-[60] w-72 focus-visible:outline-none"
          asChild
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="rounded-xl border border-border bg-surface p-3 shadow-card"
          >
            {/* Scene */}
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Scene
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              <SceneChip
                label="None"
                icon={Ban}
                selected={scene === "none"}
                onClick={() => updateAmbient("ambientScene", "none")}
              />
              {SCENES.map((def) => (
                <SceneChip
                  key={def.id}
                  label={def.label}
                  icon={def.icon}
                  selected={scene === def.id}
                  onClick={() => updateAmbient("ambientScene", def.id)}
                />
              ))}
            </div>

            {/* Sounds */}
            <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sounds
            </p>
            <div className="space-y-2">
              {SOUNDS.map((sound) => {
                const pref = sounds[sound.id];
                const unavailable = availability.get(sound.id) === false;
                const Icon = sound.icon;
                return (
                  <div key={sound.id} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pref.enabled}
                      aria-label={sound.label}
                      disabled={unavailable}
                      onClick={() => setSound(sound.id, { ...pref, enabled: !pref.enabled })}
                      className={cn(
                        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                        pref.enabled
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        unavailable && "cursor-not-allowed opacity-40 hover:bg-transparent"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs font-medium text-foreground">
                          {sound.label}
                        </span>
                        {unavailable ? (
                          <span className="text-[10px] text-muted-foreground">no file</span>
                        ) : null}
                      </div>
                      <VolumeSlider
                        value={pref.volume}
                        disabled={!pref.enabled || unavailable}
                        ariaLabel={`${sound.label} volume`}
                        onChange={(volume) => setSound(sound.id, { ...pref, volume })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Master */}
            <div className="mt-3 flex items-center gap-2.5 border-t border-border pt-3">
              <button
                type="button"
                role="switch"
                aria-checked={!muted}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
                onClick={() => updateAmbient("ambientMuted", !muted)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground">Master</span>
                <VolumeSlider
                  value={masterVolume}
                  disabled={muted}
                  ariaLabel="Master volume"
                  onChange={(volume) => updateAmbient("ambientMasterVolume", volume)}
                />
              </div>
            </div>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SceneChip({
  label,
  icon: Icon,
  selected,
  onClick
}: {
  label: string;
  icon: typeof Ban;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-medium transition-colors",
        selected
          ? "border-primary/50 bg-primary-soft text-primary"
          : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function VolumeSlider({
  value,
  disabled,
  ariaLabel,
  onChange
}: {
  value: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
