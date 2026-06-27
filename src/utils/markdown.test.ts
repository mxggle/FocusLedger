import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("returns a single text token for plain text", () => {
    expect(parseInline("just words")).toEqual([{ type: "text", value: "just words" }]);
  });

  it("parses bold, italic, and code with surrounding text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " c" }
    ]);
    expect(parseInline("an _emphasis_ here")).toEqual([
      { type: "text", value: "an " },
      { type: "italic", value: "emphasis" },
      { type: "text", value: " here" }
    ]);
    expect(parseInline("run `yarn build` now")).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: "yarn build" },
      { type: "text", value: " now" }
    ]);
  });

  it("prefers bold over italic and code over emphasis", () => {
    expect(parseInline("**strong**")).toEqual([{ type: "bold", value: "strong" }]);
    expect(parseInline("`*not italic*`")).toEqual([{ type: "code", value: "*not italic*" }]);
  });

  it("never emits raw asterisks for matched emphasis", () => {
    const tokens = parseInline("Plan **the launch** and *ship* it");
    expect(tokens.some((t) => t.type === "text" && t.value.includes("*"))).toBe(false);
  });
});

describe("parseMarkdown", () => {
  it("parses a heading followed by a paragraph", () => {
    const blocks = parseMarkdown("## Today\nFocus on the launch.");
    expect(blocks).toEqual([
      { type: "heading", level: 2, tokens: [{ type: "text", value: "Today" }] },
      { type: "paragraph", tokens: [{ type: "text", value: "Focus on the launch." }] }
    ]);
  });

  it("groups consecutive list items and splits ordered vs unordered", () => {
    const blocks = parseMarkdown("- one\n- two\n\n1. first\n2. second");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true });
    const unordered = blocks[0] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(unordered.items).toHaveLength(2);
  });

  it("joins wrapped paragraph lines and separates on blank lines", () => {
    const blocks = parseMarkdown("line one\nline two\n\nsecond para");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      tokens: [{ type: "text", value: "line one line two" }]
    });
  });

  it("parses inline emphasis inside list items", () => {
    const blocks = parseMarkdown("- do **the thing**");
    const list = blocks[0] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(list.items[0]).toContainEqual({ type: "bold", value: "the thing" });
  });
});
