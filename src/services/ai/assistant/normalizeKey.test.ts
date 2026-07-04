import { describe, expect, it } from "vitest";
import { countTermHits, extractTerms, normalizeKey } from "./normalizeKey";

describe("normalizeKey", () => {
  it("keeps CJK, folds case and width", () => {
    expect(normalizeKey("写周报 Report！")).toBe("写周报 report");
  });
});

describe("extractTerms", () => {
  it("splits latin words and drops short ones", () => {
    expect(extractTerms("plan my afternoon")).toEqual(["plan", "afternoon"]);
  });

  it("expands CJK runs into bigrams", () => {
    expect(extractTerms("剩下的时间")).toEqual(["剩下", "下的", "的时", "时间"]);
  });

  it("handles mixed CJK and latin", () => {
    const terms = extractTerms("写 report 的时间");
    expect(terms).toContain("report");
    expect(terms).toContain("的时");
    expect(terms).toContain("时间");
  });

  it("falls back to raw runs when everything is filtered out", () => {
    expect(extractTerms("go")).toEqual(["go"]);
    expect(extractTerms("吃")).toEqual(["吃"]);
  });

  it("returns empty for empty/punctuation-only input", () => {
    expect(extractTerms("")).toEqual([]);
    expect(extractTerms("!!! ...")).toEqual([]);
  });
});

describe("countTermHits", () => {
  it("matches CJK bigrams inside longer text", () => {
    const terms = extractTerms("剩下的时间");
    expect(countTermHits("今天剩下的时间怎么安排", terms)).toBe(4);
  });

  it("matches case-insensitively via normalization", () => {
    expect(countTermHits("Write REPORT draft", extractTerms("report"))).toBe(1);
  });

  it("returns 0 when nothing overlaps", () => {
    expect(countTermHits("买菜", extractTerms("report"))).toBe(0);
  });
});
