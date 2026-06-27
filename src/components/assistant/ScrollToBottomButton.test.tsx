import { describe, expect, it, vi } from "vitest";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { fireClick, render } from "./_render";

describe("ScrollToBottomButton", () => {
  it("renders the pill when visible", () => {
    const container = render(<ScrollToBottomButton visible={true} onClick={() => undefined} />);
    const button = container.querySelector('[aria-label="Scroll to latest"]');
    expect(button).not.toBeNull();
  });

  it("renders nothing when not visible", () => {
    const container = render(<ScrollToBottomButton visible={false} onClick={() => undefined} />);
    expect(container.querySelector('[aria-label="Scroll to latest"]')).toBeNull();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const container = render(<ScrollToBottomButton visible={true} onClick={onClick} />);
    fireClick(container.querySelector('[aria-label="Scroll to latest"]')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
