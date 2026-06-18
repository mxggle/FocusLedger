import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn } from "./assistantRunner";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { ChatTurn } from "../providers";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [{ id: "c1", name: "Deep Work" } as never]
};

const settings = { aiProvider: "anthropic" as const, aiApiKey: "k", aiModel: "", aiBaseUrl: "" };

describe("runAssistantTurn", () => {
  it("builds context, calls generateChat with system + messages, parses result", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ reply: "Done", actions: [] }));
    const messages: ChatTurn[] = [{ role: "user", content: "hi" }];

    const result = await runAssistantTurn(
      { settings, snapshot, messages },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(1);
    const callArg = generateChat.mock.calls[0][1];
    expect(callArg.system).toContain("Yolo Assistant");
    expect(callArg.messages).toEqual(messages);
    expect(result.reply).toBe("Done");
  });
});
