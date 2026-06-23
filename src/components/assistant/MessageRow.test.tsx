import { describe, expect, it, vi } from "vitest";
import type { AssistantStatus } from "../../stores/assistantStore";
import type { ChatMessage } from "../../services/ai/assistant/types";
import { MessageRow } from "./MessageRow";
import { fireClick, fireInput, flush, render } from "./_render";

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
    applyToolCall: vi.fn(),
    revertToolCall: vi.fn(),
    dismissToolCall: vi.fn(),
    clear: vi.fn()
  }
}));

vi.mock("../../stores/assistantStore", () => ({
  useAssistantStore: Object.assign(
    (selector: (s: typeof mockAssistant) => unknown) => selector(mockAssistant),
    { getState: () => mockAssistant }
  )
}));

const { mockUi } = vi.hoisted(() => ({
  mockUi: { addToast: vi.fn(), requestRoute: vi.fn(), closeAssistant: vi.fn() }
}));
vi.mock("../../stores/uiStore", () => ({
  useUiStore: Object.assign(
    (selector: (s: typeof mockUi) => unknown) => selector(mockUi),
    { getState: () => mockUi }
  )
}));

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText, readText: vi.fn() }));

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "a1",
    role: "assistant",
    content: "Here is your plan",
    createdAt: "2026-06-20T09:30:00Z",
    ...overrides
  };
}

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "u1",
    role: "user",
    content: "plan my day",
    createdAt: "2026-06-20T09:29:00Z",
    ...overrides
  };
}

function byLabel(container: HTMLElement, label: string): Element {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`element with aria-label="${label}" not found`);
  return el;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  if (!match) throw new Error(`button "${text}" not found`);
  return match;
}

describe("MessageRow — assistant", () => {
  it("renders the reply markdown and a hover toolbar with Copy and Regenerate", () => {
    const message = assistantMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    expect(container.textContent).toContain("Here is your plan");
    expect(byLabel(container, "Copy")).toBeTruthy();
    expect(byLabel(container, "Regenerate")).toBeTruthy();
  });

  it("appends a streaming caret while streaming", () => {
    const message = assistantMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={true} />);
    expect(container.querySelector("[data-streaming-caret]")).not.toBeNull();
  });

  it("shows a muted 'Stopped' footnote when the message was stopped", () => {
    const message = assistantMessage({ content: "partial reply", stopped: true });
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    expect(container.textContent).toContain("Stopped");
  });

  it("copies the reply to the clipboard and toasts on Copy", async () => {
    const message = assistantMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    fireClick(byLabel(container, "Copy"));
    await flush();
    expect(writeText).toHaveBeenCalledWith("Here is your plan");
    expect(mockUi.addToast).toHaveBeenCalled();
  });

  it("calls regenerateLast when Regenerate is clicked", () => {
    const message = assistantMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    fireClick(byLabel(container, "Regenerate"));
    expect(mockAssistant.regenerateLast).toHaveBeenCalledTimes(1);
  });

  it("renders a pending tool call and applies or dismisses it", () => {
    const message = assistantMessage({
      toolCalls: [
        {
          id: "tc1",
          name: "update_task",
          args: { task_id: "t1", planned_start_time: "09:30" },
          category: "write",
          destructive: false,
          summary: "Move Report to 09:30",
          status: "pending"
        }
      ]
    });
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    expect(container.textContent).toContain("Move Report to 09:30");
    fireClick(buttonByText(container, "Apply"));
    expect(mockAssistant.applyToolCall).toHaveBeenCalledWith("a1", "tc1");
    fireClick(byLabel(container, "Dismiss tool call"));
    expect(mockAssistant.dismissToolCall).toHaveBeenCalledWith("a1", "tc1");
  });

  it("renders an executed tool call with a revert action", () => {
    const message = assistantMessage({
      toolCalls: [
        {
          id: "tc1",
          name: "update_task",
          args: { task_id: "t1" },
          category: "write",
          destructive: false,
          summary: "Moved Report",
          status: "executed",
          undo: {
            kind: "restore_task",
            taskId: "t1",
            before: {
              title: "Report",
              description: null,
              category_id: null,
              priority: "medium",
              estimated_minutes: null,
              due_date: "2026-06-20",
              planned_start_time: null,
              planned_end_time: null,
              status: "todo",
              updated_at: "u0"
            }
          }
        }
      ]
    });
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    expect(container.textContent).toContain("Done");
    fireClick(byLabel(container, "Revert tool call"));
    expect(mockAssistant.revertToolCall).toHaveBeenCalledWith("a1", "tc1");
  });
});

describe("MessageRow — user", () => {
  it("renders the message block and an Edit affordance", () => {
    const message = userMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    expect(container.textContent).toContain("plan my day");
    expect(byLabel(container, "Edit")).toBeTruthy();
  });

  it("swaps to an inline editor on Edit and saves via editUserMessage", () => {
    const message = userMessage();
    mockAssistant.messages = [message];
    const container = render(<MessageRow message={message} isStreaming={false} />);
    fireClick(byLabel(container, "Edit"));
    const textarea = container.querySelector("textarea")!;
    expect(textarea).not.toBeNull();
    fireInput(textarea, "plan tomorrow instead");
    fireClick(buttonByText(container, "Save"));
    expect(mockAssistant.editUserMessage).toHaveBeenCalledWith("u1", "plan tomorrow instead");
  });
});
