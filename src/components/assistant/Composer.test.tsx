import { describe, expect, it, vi } from "vitest";
import type { AssistantStatus } from "../../stores/assistantStore";
import type { ChatMessage } from "../../services/ai/assistant/types";
import { buildPlanPrompt, Composer } from "./Composer";
import { fireClick, fireInput, fireKey, render } from "./_render";

const { mockAssistant } = vi.hoisted(() => ({
  mockAssistant: {
    messages: [] as ChatMessage[],
    status: "idle" as AssistantStatus,
    steps: [] as string[],
    error: null as string | null,
    streamingMessageId: null as string | null,
    send: vi.fn(),
    stop: vi.fn(),
    regenerateLast: vi.fn(),
    editUserMessage: vi.fn(),
    clear: vi.fn()
  }
}));

vi.mock("../../stores/assistantStore", () => ({
  useAssistantStore: Object.assign(
    (selector: (s: typeof mockAssistant) => unknown) => selector(mockAssistant),
    { getState: () => mockAssistant }
  )
}));

const { mockSettings } = vi.hoisted(() => ({
  mockSettings: { aiApiKey: "k", aiModel: "", aiProvider: "anthropic", aiBaseUrl: "" }
}));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (selector: (s: { settings: typeof mockSettings }) => unknown) => selector({ settings: mockSettings }),
    { getState: () => ({ settings: mockSettings }) }
  )
}));

vi.mock("../../services/ai/aiClient", () => ({ hasAiKey: () => true }));

const { mockUi } = vi.hoisted(() => ({
  mockUi: { addToast: vi.fn(), requestRoute: vi.fn(), closeAssistant: vi.fn() }
}));
vi.mock("../../stores/uiStore", () => ({
  useUiStore: Object.assign(
    (selector: (s: typeof mockUi) => unknown) => selector(mockUi),
    { getState: () => mockUi }
  )
}));

function textarea(container: HTMLElement): HTMLTextAreaElement {
  return container.querySelector("textarea")!;
}

function chip(container: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label
  );
  if (!match) throw new Error(`chip "${label}" not found`);
  return match;
}

describe("Composer", () => {
  it("sends on Enter in Quick mode", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireClick(chip(container, "Quick"));
    fireInput(textarea(container), "hi");
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).toHaveBeenCalledWith("hi", undefined);
  });

  it("does not send on Shift+Enter", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireClick(chip(container, "Quick"));
    fireInput(textarea(container), "hi");
    fireKey(textarea(container), "Enter", { shiftKey: true });
    expect(mockAssistant.send).not.toHaveBeenCalled();
  });

  it("displays the raw input but sends the Plan-wrapped prompt to the model in Plan mode", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "plan my day");
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).toHaveBeenCalledWith("plan my day", buildPlanPrompt("plan my day"));
  });

  it("toggles mode chips", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    const plan = chip(container, "Plan");
    const quick = chip(container, "Quick");
    expect(plan.getAttribute("aria-pressed")).toBe("true");
    expect(quick.getAttribute("aria-pressed")).toBe("false");
    fireClick(quick);
    expect(quick.getAttribute("aria-pressed")).toBe("true");
    expect(plan.getAttribute("aria-pressed")).toBe("false");
    fireClick(plan);
    expect(plan.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a Stop button that calls stop while streaming", () => {
    mockAssistant.status = "streaming";
    const container = render(<Composer />);
    const stop = container.querySelector('[aria-label="Stop"]');
    expect(stop).not.toBeNull();
    fireClick(stop!);
    expect(mockAssistant.stop).toHaveBeenCalledTimes(1);
  });

  it("opens the slash command menu when '/' is typed", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "/");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it("executes /clear immediately with a toast", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "/");
    const clearItem = container.querySelector('[data-cmd="clear"]');
    expect(clearItem).not.toBeNull();
    fireClick(clearItem!);
    expect(mockAssistant.clear).toHaveBeenCalledTimes(1);
    expect(mockUi.addToast).toHaveBeenCalled();
  });
});
