import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flush, render } from "../assistant/_render";
import type { ModelOption } from "../../services/ai/models";

const fetchModels = vi.fn<() => Promise<ModelOption[]>>();
vi.mock("../../services/ai/modelsClient", () => ({
  fetchModels: () => fetchModels(),
  invalidateModels: () => undefined
}));

import { ModelPicker } from "./ModelPicker";
import type { AiSettings } from "../../services/ai/providers";

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    aiProvider: "anthropic",
    aiApiKey: "key-123",
    aiModel: "",
    aiBaseUrl: "",
    ...overrides
  };
}

function selectValue(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector("select");
  if (!select) throw new Error("no select rendered");
  return select;
}

/** Pick an option the way a user would: React only sees a native change event. */
function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function optionText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("option")).map((o) => o.textContent ?? "");
}

describe("ModelPicker", () => {
  beforeEach(() => {
    fetchModels.mockReset();
    fetchModels.mockResolvedValue([]);
  });

  it("offers the curated shortlist without asking the provider for a key it lacks", async () => {
    const container = render(
      <ModelPicker
        label="Model"
        settings={settings({ aiApiKey: "" })}
        value=""
        onChange={() => undefined}
        emptyLabel="Default (claude-opus-5)"
      />
    );
    await flush();

    expect(fetchModels).not.toHaveBeenCalled();
    const text = optionText(container).join("|");
    expect(text).toContain("Default (claude-opus-5)");
    expect(text).toContain("Claude Opus 5 · Most capable");
    expect(text).toContain("Other model ID…");
  });

  it("lists what the key can actually reach and commits the choice", async () => {
    fetchModels.mockResolvedValue([
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" }
    ]);
    const onChange = vi.fn();
    const container = render(
      <ModelPicker
        label="Model"
        settings={settings()}
        value=""
        onChange={onChange}
        emptyLabel="Default (claude-opus-5)"
      />
    );
    await flush();

    const text = optionText(container).join("|");
    expect(text).toContain("Claude Opus 4.7 · claude-opus-4-7");
    // Curated but not served by this key, so it is not offered.
    expect(text).not.toContain("Claude Haiku 4.5");

    choose(selectValue(container), "claude-opus-4-7");
    expect(onChange).toHaveBeenCalledWith("claude-opus-4-7");
  });

  it("keeps an id the catalog does not know in a free-text field", async () => {
    const container = render(
      <ModelPicker
        label="Model"
        settings={settings({ aiApiKey: "" })}
        value="my-local-llama"
        onChange={() => undefined}
        emptyLabel="Default (claude-opus-5)"
      />
    );
    await flush();

    expect(selectValue(container).value).toBe("__custom__");
    const input = container.querySelector("input");
    expect(input?.value).toBe("my-local-llama");
  });

  it("reveals the free-text field on demand", async () => {
    const container = render(
      <ModelPicker
        label="Model"
        settings={settings({ aiApiKey: "" })}
        value=""
        onChange={() => undefined}
        emptyLabel="Default (claude-opus-5)"
      />
    );
    await flush();
    expect(container.querySelector("input")).toBeNull();

    choose(selectValue(container), "__custom__");
    expect(container.querySelector("input")).not.toBeNull();
  });
});
