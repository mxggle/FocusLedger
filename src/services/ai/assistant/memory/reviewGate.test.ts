import { describe, expect, it } from "vitest";
import { shouldReview } from "./reviewGate";

describe("shouldReview", () => {
  it("skips trivial acknowledgements", () => {
    expect(shouldReview("thanks!", "You're welcome.")).toBe(false);
    expect(shouldReview("ok", "Done.")).toBe(false);
    expect(shouldReview("👍", "")).toBe(false);
  });

  it("reviews substantive user turns", () => {
    expect(shouldReview("I always batch admin work on Fridays", "Noted.")).toBe(true);
  });

  it("reviews corrections/preferences even when short", () => {
    expect(shouldReview("stop padding my estimates", "Okay.")).toBe(true);
    expect(shouldReview("remember I hate meetings before 10am", "Got it.")).toBe(true);
  });

  it("skips when user text is empty", () => {
    expect(shouldReview("   ", "anything")).toBe(false);
  });
});
