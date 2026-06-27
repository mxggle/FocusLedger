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

describe("Composer", () => {
  it("sends raw input as-is on Enter", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "hi");
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).toHaveBeenCalledWith("hi", undefined);
  });

  it("does not send on Shift+Enter", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "hi");
    fireKey(textarea(container), "Enter", { shiftKey: true });
    expect(mockAssistant.send).not.toHaveBeenCalled();
  });

  it("/plan displays the raw args but sends the Plan-wrapped prompt to the model", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireInput(textarea(container), "/plan my day");
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).toHaveBeenCalledWith("my day", buildPlanPrompt("my day"));
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

  it("AI-UI-03: shows the Enter/Shift+Enter keyboard hints and a live char count", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    expect(container.textContent).toContain("to send");
    expect(container.textContent).toContain("for a new line");
    fireInput(textarea(container), "hi");
    expect(container.textContent).toContain("· 2");
  });

  it("AI-UI-03: Enter does not send when the input is empty", () => {
    mockAssistant.status = "idle";
    const container = render(<Composer />);
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).not.toHaveBeenCalled();
  });

  it("AI-UI-05: Enter does not send a second turn while the assistant is busy", () => {
    mockAssistant.status = "streaming";
    const container = render(<Composer />);
    fireInput(textarea(container), "another");
    fireKey(textarea(container), "Enter");
    expect(mockAssistant.send).not.toHaveBeenCalled();
  });

  it("AI-UI-06: shows a Stop button that calls stop while thinking", () => {
    mockAssistant.status = "thinking";
    const container = render(<Composer />);
    const stop = container.querySelector('[aria-label="Stop"]');
    expect(stop).not.toBeNull();
    fireClick(stop!);
    expect(mockAssistant.stop).toHaveBeenCalledTimes(1);
  });
});
