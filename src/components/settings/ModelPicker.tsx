import { Loader2, RefreshCw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useAsyncResource } from "../../hooks/useAsyncResource";
import {
  buildModelsRequest,
  CURATED_MODELS,
  mergeModelOptions,
  type ModelOption
} from "../../services/ai/models";
import { requiresApiKey } from "../../services/ai/providerCatalog";
import { fetchModels, invalidateModels } from "../../services/ai/modelsClient";
import type { AiSettings } from "../../services/ai/providers";
import { Input, Select } from "../ui/Field";

/** Sentinel select value for "let me type an id the list doesn't have". */
const CUSTOM = "__custom__";

type ModelPickerProps = {
  label: string;
  /** Provider + key + base URL: what the catalog lookup depends on. */
  settings: AiSettings;
  /** The stored model id; empty means "use the fallback described below". */
  value: string;
  onChange: (value: string) => void;
  /** What an empty value means, e.g. "Default (claude-opus-5)". */
  emptyLabel: string;
  hint?: string;
};

/**
 * Picks a model from what the provider actually serves, with the curated
 * shortlist on top and a free-text escape hatch underneath. Typing an id by
 * hand stays possible — it's just no longer the only way, so a typo or a model
 * the key can't reach isn't discovered as a failed request later.
 */
export function ModelPicker({
  label,
  settings,
  value,
  onChange,
  emptyLabel,
  hint
}: ModelPickerProps) {
  const selectId = useId();
  const [customOpen, setCustomOpen] = useState(false);

  // Local runtimes take no key, so they can be asked for their catalog right
  // away; everyone else needs one first.
  const needsKey = requiresApiKey(settings.aiProvider);
  const hasCredential = settings.aiApiKey.trim().length > 0 || !needsKey;
  // Some endpoints publish no catalog at all (the Codex backend); asking would
  // only produce a failure where the curated shortlist is the honest answer.
  const listable = buildModelsRequest({ ...settings, aiApiKey: "probe" }) !== null;
  const catalog = useAsyncResource<ModelOption[]>(
    () => fetchModels(settings),
    [],
    [settings.aiProvider, settings.aiApiKey, settings.aiBaseUrl],
    { enabled: hasCredential && listable }
  );

  const options = useMemo(
    () => mergeModelOptions(CURATED_MODELS[settings.aiProvider], catalog.data),
    [settings.aiProvider, catalog.data]
  );
  const curatedIds = useMemo(
    () => new Set(CURATED_MODELS[settings.aiProvider].map((option) => option.id)),
    [settings.aiProvider]
  );

  const recommended = options.filter((option) => curatedIds.has(option.id));
  const others = options.filter((option) => !curatedIds.has(option.id));
  const listed = value !== "" && options.some((option) => option.id === value);
  // A stored id the list doesn't carry (a preview model, a self-hosted name)
  // means the free-text field, so the setting is never silently rewritten.
  const custom = customOpen || (value !== "" && !listed);

  return (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select
        id={selectId}
        value={custom ? CUSTOM : value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(next);
        }}
      >
        <option value="">{emptyLabel}</option>
        {recommended.length > 0 ? (
          <optgroup label="Recommended">
            {recommended.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {others.length > 0 ? (
          <optgroup label="Also available">
            {others.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value={CUSTOM}>Other model ID…</option>
      </Select>
      {custom ? (
        <Input
          type="text"
          aria-label={`${label} ID`}
          placeholder="e.g. gemini-2.5-flash"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {hint ? <span className="text-xs text-subtle">{hint}</span> : <span />}
        <CatalogStatus
          listable={listable}
          hasKey={hasCredential}
          loading={catalog.loading}
          error={catalog.error}
          count={catalog.data.length}
          onRefresh={() => {
            invalidateModels(settings);
            catalog.reload();
          }}
        />
      </div>
    </div>
  );
}

function optionLabel(option: ModelOption): string {
  const detail = option.hint ?? (option.label === option.id ? "" : option.id);
  return detail.length > 0 ? `${option.label} · ${detail}` : option.label;
}

/** Says where the list came from, and offers a re-fetch when it's stale. */
function CatalogStatus({
  listable,
  hasKey,
  loading,
  error,
  count,
  onRefresh
}: {
  listable: boolean;
  hasKey: boolean;
  loading: boolean;
  error: boolean;
  count: number;
  onRefresh: () => void;
}) {
  if (!listable) {
    return <span className="shrink-0 text-xs text-subtle">Recommended models</span>;
  }
  if (!hasKey) {
    return <span className="shrink-0 text-xs text-subtle">Add a key to list every model</span>;
  }

  if (loading) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-subtle">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Loading models…
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {error || count === 0
        ? "Couldn't load the list — retry"
        : `${count} models available · Refresh`}
    </button>
  );
}
