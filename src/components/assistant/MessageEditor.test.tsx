import { describe, expect, it, vi } from "vitest";
import { MessageEditor } from "./MessageEditor";
import { fireClick, fireInput, fireKey, render } from "./_render";

function textarea(container: HTMLElement): HTMLTextAreaElement {
  return container.querySelector("textarea")!;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text)
  );
  if (!match) throw new Error(`button "${text}" not found`);
  return match;
}

describe("MessageEditor", () => {
  it("prefills the textarea with the initial text", () => {
    const container = render(
      <MessageEditor initialText="plan my day" onSave={() => undefined} onCancel={() => undefined} />
    );
    expect(textarea(container).value).toBe("plan my day");
  });

  it("Save calls onSave with the edited text", () => {
    const onSave = vi.fn();
    const container = render(<MessageEditor initialText="hi" onSave={onSave} onCancel={() => undefined} />);
    fireInput(textarea(container), "hi there");
    fireClick(buttonByText(container, "Save"));
    expect(onSave).toHaveBeenCalledWith("hi there");
  });

  it("Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    const container = render(<MessageEditor initialText="hi" onSave={() => undefined} onCancel={onCancel} />);
    fireClick(buttonByText(container, "Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Enter saves the edited text", () => {
    const onSave = vi.fn();
    const container = render(<MessageEditor initialText="hi" onSave={onSave} onCancel={() => undefined} />);
    fireInput(textarea(container), "edited");
    fireKey(textarea(container), "Enter");
    expect(onSave).toHaveBeenCalledWith("edited");
  });

  it("Escape cancels", () => {
    const onCancel = vi.fn();
    const container = render(<MessageEditor initialText="hi" onSave={() => undefined} onCancel={onCancel} />);
    fireKey(textarea(container), "Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
