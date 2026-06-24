import { describe, expect, it } from "vitest";
import { extractErrorMessage, parseAiResponse } from "../../providers";
import {
  ANTHROPIC_TEXT_PAYLOAD,
  EMPTY_RESPONSE_PAYLOAD,
  GEMINI_FUNCTION_CALL_PAYLOAD,
  GEMINI_TEXT_PAYLOAD,
  OPENAI_TEXT_PAYLOAD,
  PROVIDER_401_PAYLOAD,
  PROVIDER_429_PAYLOAD
} from "./fixtures";

describe("provider payload fixtures", () => {
  it("anthropic text payload parses to the reply text", () => {
    expect(parseAiResponse("anthropic", ANTHROPIC_TEXT_PAYLOAD)).toEqual({
      text: "Here is your plan for the day.",
      toolCalls: []
    });
  });

  it("openai text payload parses to the reply text", () => {
    expect(parseAiResponse("openai", OPENAI_TEXT_PAYLOAD)).toEqual({
      text: "Here is your plan for the day.",
      toolCalls: []
    });
  });

  it("gemini text payload parses to the reply text", () => {
    expect(parseAiResponse("gemini", GEMINI_TEXT_PAYLOAD)).toEqual({
      text: "Here is your plan for the day.",
      toolCalls: []
    });
  });

  it("gemini functionCall payload converts to structured tool calls", () => {
    expect(parseAiResponse("gemini", GEMINI_FUNCTION_CALL_PAYLOAD)).toEqual({
      text: "",
      toolCalls: [
        { name: "list_tasks", args: { scope: "today" } },
        { name: "update_task", args: { task_id: "task-1", planned_start_time: "09:30" } }
      ]
    });
  });

  it("empty response payload throws a controlled empty-response error", () => {
    expect(() => parseAiResponse("anthropic", EMPTY_RESPONSE_PAYLOAD)).toThrow(/empty/i);
    expect(() => parseAiResponse("openai", EMPTY_RESPONSE_PAYLOAD)).toThrow(/empty/i);
    expect(() => parseAiResponse("gemini", EMPTY_RESPONSE_PAYLOAD)).toThrow(/empty/i);
  });

  it("provider error payloads surface a human-readable message", () => {
    expect(extractErrorMessage(PROVIDER_401_PAYLOAD)).toBe("invalid x-api-key");
    expect(extractErrorMessage(PROVIDER_429_PAYLOAD)).toBe("rate limit exceeded");
  });
});
