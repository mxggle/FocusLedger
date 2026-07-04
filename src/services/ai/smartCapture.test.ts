import { describe, expect, it } from "vitest";
import {
  buildSmartCaptureSystemPrompt,
  parseSmartCaptureResponse,
  type SmartCaptureOptions
} from "./smartCapture";

const options: SmartCaptureOptions = {
  text: "write report tomorrow, about 1h, work stuff",
  categories: [
    { id: "cat-work", name: "Work" },
    { id: "cat-inbox", name: "Inbox" }
  ],
  today: "2026-07-03",
  defaultDueDate: "2026-07-03"
};

describe("buildSmartCaptureSystemPrompt", () => {
  it("includes today's date and the category names", () => {
    const prompt = buildSmartCaptureSystemPrompt(options);
    expect(prompt).toContain("2026-07-03");
    expect(prompt).toContain("Work, Inbox");
  });

  it("marks an empty category list", () => {
    const prompt = buildSmartCaptureSystemPrompt({ ...options, categories: [] });
    expect(prompt).toContain("(none)");
  });
});

describe("parseSmartCaptureResponse", () => {
  it("maps a full response to CreateTaskInput", () => {
    const raw = JSON.stringify({
      title: "Write report",
      category: "work",
      priority: "high",
      estimated_minutes: 60,
      due_date: "2026-07-04"
    });
    expect(parseSmartCaptureResponse(raw, options)).toEqual({
      title: "Write report",
      category_id: "cat-work",
      priority: "high",
      estimated_minutes: 60,
      due_date: "2026-07-04"
    });
  });

  it("extracts JSON wrapped in code fences or prose", () => {
    const raw = '```json\n{"title": "Buy milk"}\n```';
    const input = parseSmartCaptureResponse(raw, options);
    expect(input.title).toBe("Buy milk");
  });

  it("falls back to the raw text when the title is missing or empty", () => {
    const input = parseSmartCaptureResponse('{"title": "  "}', options);
    expect(input.title).toBe(options.text);
  });

  it("applies defaults for unknown category, bad estimate, and bad date", () => {
    const raw = JSON.stringify({
      title: "Task",
      category: "Nonexistent",
      estimated_minutes: -5,
      due_date: "next week"
    });
    expect(parseSmartCaptureResponse(raw, options)).toEqual({
      title: "Task",
      category_id: null,
      priority: "medium",
      estimated_minutes: null,
      due_date: "2026-07-03"
    });
  });

  it("keeps a null default due date for backlog captures", () => {
    const input = parseSmartCaptureResponse('{"title": "Someday"}', {
      ...options,
      defaultDueDate: null
    });
    expect(input.due_date).toBeNull();
  });

  it("rounds fractional estimates", () => {
    const input = parseSmartCaptureResponse(
      '{"title": "Task", "estimated_minutes": 22.6}',
      options
    );
    expect(input.estimated_minutes).toBe(23);
  });

  it("throws on replies without a JSON object", () => {
    expect(() => parseSmartCaptureResponse("sorry, I cannot", options)).toThrow(
      /no JSON object/
    );
  });

  it("throws on malformed JSON", () => {
    expect(() => parseSmartCaptureResponse('{"title": ', options)).toThrow();
  });
});
