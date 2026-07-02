import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireInput, render } from "../assistant/_render";
import { QuickAddDialog } from "./QuickAddDialog";

const { mockCreateTask, mockSmartCapture, mockUi } = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockSmartCapture: vi.fn(),
  mockUi: {
    quickAddOpen: true,
    closeQuickAdd: vi.fn(),
    addToast: vi.fn()
  }
}));

vi.mock("../../services/ai/aiClient", () => ({ hasAiKey: () => true }));
vi.mock("../../services/ai/smartCapture", () => ({
  smartCaptureTask: mockSmartCapture
}));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { settings: Record<string, string> }) => unknown) =>
    selector({
      settings: {
        aiApiKey: "key",
        aiProvider: "anthropic",
        aiModel: "",
        aiBaseUrl: "",
        defaultCategoryId: "inbox"
      }
    })
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      categories: [{ id: "inbox", name: "Inbox" }],
      createTask: mockCreateTask
    })
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: (selector: (state: typeof mockUi) => unknown) => selector(mockUi)
}));

describe("QuickAddDialog", () => {
  it("does not claim fallback creation succeeded when task creation fails", async () => {
    mockSmartCapture.mockRejectedValueOnce(new Error("AI unavailable"));
    mockCreateTask.mockResolvedValueOnce({ ok: false, error: "DB unavailable" });
    render(<QuickAddDialog />);

    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Capture a task"]'
    )!;
    fireInput(input, "Write report tomorrow");

    await act(async () => {
      document.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockUi.addToast).not.toHaveBeenCalled();
  });
});
