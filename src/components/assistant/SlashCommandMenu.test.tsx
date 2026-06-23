import { describe, expect, it, vi } from "vitest";
import { COMMANDS, SlashCommandMenu } from "./SlashCommandMenu";
import { fireKey, render } from "./_render";

describe("SlashCommandMenu", () => {
  it("lists all commands when the query is empty", () => {
    const container = render(
      <SlashCommandMenu query="" anchorRect={null} onSelect={() => undefined} onClose={() => undefined} />
    );
    expect(container.querySelectorAll("button")).toHaveLength(COMMANDS.length);
  });

  it("filters commands by the slash token", () => {
    const container = render(
      <SlashCommandMenu query="clear" anchorRect={null} onSelect={() => undefined} onClose={() => undefined} />
    );
    const items = Array.from(container.querySelectorAll("button"));
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Clear");
  });

  it("shows nothing for an unknown query", () => {
    const container = render(
      <SlashCommandMenu query="zzz" anchorRect={null} onSelect={() => undefined} onClose={() => undefined} />
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("selects the highlighted command on Enter", () => {
    const onSelect = vi.fn();
    render(<SlashCommandMenu query="" anchorRect={null} onSelect={onSelect} onClose={() => undefined} />);
    fireKey(document, "Enter");
    expect(onSelect).toHaveBeenCalledWith(COMMANDS[0]);
  });

  it("moves the highlight with ArrowDown then selects on Enter", () => {
    const onSelect = vi.fn();
    render(<SlashCommandMenu query="" anchorRect={null} onSelect={onSelect} onClose={() => undefined} />);
    fireKey(document, "ArrowDown");
    fireKey(document, "Enter");
    expect(onSelect).toHaveBeenCalledWith(COMMANDS[1]);
  });

  it("does not select when no commands match", () => {
    const onSelect = vi.fn();
    render(<SlashCommandMenu query="zzz" anchorRect={null} onSelect={onSelect} onClose={() => undefined} />);
    fireKey(document, "Enter");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<SlashCommandMenu query="" anchorRect={null} onSelect={() => undefined} onClose={onClose} />);
    fireKey(document, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
