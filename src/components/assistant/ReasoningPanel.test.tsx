import { describe, expect, it } from "vitest";
import { ReasoningPanel } from "./ReasoningPanel";
import { fireClick, render } from "./_render";

describe("ReasoningPanel", () => {
  it("renders a collapsed 'Thought process' header when done", () => {
    const container = render(<ReasoningPanel steps={["Loaded tasks", "Estimated load"]} active={false} />);
    expect(container.textContent).toContain("Thought process");
    expect(container.textContent).not.toContain("Loaded tasks");
  });

  it("expands to list completed steps when the header is clicked", () => {
    const container = render(<ReasoningPanel steps={["Loaded tasks", "Estimated load"]} active={false} />);
    fireClick(container.querySelector("button")!);
    expect(container.textContent).toContain("Loaded tasks");
    expect(container.textContent).toContain("Estimated load");
  });

  it("collapses again on a second click", () => {
    const container = render(<ReasoningPanel steps={["Loaded tasks"]} active={false} />);
    const header = container.querySelector("button")!;
    fireClick(header);
    fireClick(header);
    expect(container.textContent).not.toContain("Loaded tasks");
  });

  it("shows 'Thinking' and the latest step while active", () => {
    const container = render(<ReasoningPanel steps={["Loaded tasks", "Estimated load"]} active={true} />);
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).toContain("Estimated load");
  });

  it("shows 'Analyzing…' while active with no steps yet", () => {
    const container = render(<ReasoningPanel steps={[]} active={true} />);
    expect(container.textContent).toContain("Analyzing");
  });
});
