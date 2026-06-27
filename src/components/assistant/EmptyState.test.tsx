import { describe, expect, it, vi } from "vitest";
import { AssistantEmptyState } from "./EmptyState";
import { fireClick, render } from "./_render";

describe("AssistantEmptyState", () => {
  it("renders four intent cards", () => {
    const container = render(<AssistantEmptyState name="Yolo" onPick={() => undefined} />);
    const cards = container.querySelectorAll("button");
    expect(cards).toHaveLength(4);
  });

  it("calls onPick with each intent's prompt when its card is clicked", () => {
    const onPick = vi.fn();
    const container = render(<AssistantEmptyState name="Yolo" onPick={onPick} />);
    const cards = Array.from(container.querySelectorAll("button"));

    const pickByLabel = (label: string) => {
      const card = cards.find((c) => c.textContent?.includes(label));
      if (!card) throw new Error(`card "${label}" not found`);
      fireClick(card);
    };

    pickByLabel("Plan my day");
    pickByLabel("How is today looking?");
    pickByLabel("Break down");
    pickByLabel("Reschedule");

    expect(onPick.mock.calls.map((c) => c[0])).toEqual([
      "Plan my day",
      "How is today looking?",
      "Break down: launch the new landing page this week",
      "Reschedule what I didn't finish to tomorrow"
    ]);
  });

  it("AI-UI-02: every intent card sends a non-empty, distinct, documented prompt", () => {
    const onPick = vi.fn();
    const container = render(<AssistantEmptyState name="Yolo" onPick={onPick} />);
    const cards = Array.from(container.querySelectorAll("button"));
    cards.forEach((card) => fireClick(card));

    const prompts = onPick.mock.calls.map((c) => c[0] as string);
    expect(prompts).toHaveLength(4);
    expect(prompts.every((prompt) => prompt.trim().length > 0)).toBe(true);
    expect(new Set(prompts).size).toBe(4);
    expect(prompts).toContain("Plan my day");
    expect(prompts).toContain("How is today looking?");
    expect(prompts.some((prompt) => prompt.startsWith("Break down:"))).toBe(true);
    expect(prompts.some((prompt) => /reschedule/i.test(prompt))).toBe(true);
  });
});
