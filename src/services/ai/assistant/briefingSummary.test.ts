import { describe, expect, it } from "vitest";
import { formatMinutes, summarizeBriefing } from "./briefingSummary";
import type { DayBriefing } from "./dayBriefing";

function briefing(partial: Partial<DayBriefing>): DayBriefing {
  return {
    scheduledMinutes: partial.scheduledMinutes ?? 0,
    targetMinutes: partial.targetMinutes ?? 240,
    overcommitMinutes: partial.overcommitMinutes ?? 0,
    openCount: partial.openCount ?? 0,
    doneCount: partial.doneCount ?? 0,
    backlogCount: partial.backlogCount ?? 0,
    status: partial.status ?? "balanced"
  };
}

describe("formatMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(300)).toBe("5h");
  });

  it("never returns negative", () => {
    expect(formatMinutes(-10)).toBe("0m");
  });
});

describe("summarizeBriefing", () => {
  it("overcommitted → warn tone with a trim CTA", () => {
    const s = summarizeBriefing(briefing({ status: "overcommitted", scheduledMinutes: 300, overcommitMinutes: 60 }));
    expect(s.tone).toBe("warn");
    expect(s.headline.toLowerCase()).toContain("overcommitted");
    expect(s.cta?.label).toBe("Trim my day");
    expect(s.cta?.prompt.length).toBeGreaterThan(0);
  });

  it("empty with backlog → info tone with a plan CTA", () => {
    const s = summarizeBriefing(briefing({ status: "empty", openCount: 0, backlogCount: 5 }));
    expect(s.tone).toBe("info");
    expect(s.cta?.label).toBe("Plan my day");
  });

  it("empty with no backlog → no CTA", () => {
    expect(summarizeBriefing(briefing({ status: "empty", backlogCount: 0 })).cta).toBeNull();
  });

  it("light with backlog → fill-from-backlog CTA", () => {
    const s = summarizeBriefing(briefing({ status: "light", scheduledMinutes: 30, backlogCount: 3 }));
    expect(s.cta?.label).toBe("Fill from backlog");
  });

  it("balanced → good tone, no CTA", () => {
    const s = summarizeBriefing(briefing({ status: "balanced", scheduledMinutes: 180 }));
    expect(s.tone).toBe("good");
    expect(s.cta).toBeNull();
  });
});
