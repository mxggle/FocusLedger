import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { render } from "../assistant/_render";

describe("Button", () => {
  it("keeps a solid fallback behind the stylesheet-owned primary gradient", () => {
    const container = render(<Button>Quick add</Button>);
    const button = container.querySelector("button");

    expect(button?.classList.contains("bg-primary")).toBe(true);
    expect(button?.classList.contains("yolo-brand-gradient")).toBe(true);
    expect(button?.classList.contains("yolo-brand-gradient-hover")).toBe(true);
  });
});
