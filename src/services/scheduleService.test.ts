import { describe, expect, it } from "vitest";
import { templateAppliesToDate } from "./scheduleService";
import type { TaskTemplate } from "../types";

const baseTemplate: Pick<TaskTemplate, "recurrence_type" | "recurrence_days"> = {
  recurrence_type: "daily",
  recurrence_days: []
};

describe("templateAppliesToDate", () => {
  it("matches daily templates on every date", () => {
    expect(templateAppliesToDate(baseTemplate, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(baseTemplate, "2026-06-07")).toBe(true);
  });

  it("matches weekdays from Monday through Friday", () => {
    const template = { ...baseTemplate, recurrence_type: "weekdays" as const };

    expect(templateAppliesToDate(template, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-05")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-06")).toBe(false);
    expect(templateAppliesToDate(template, "2026-06-07")).toBe(false);
  });

  it("matches explicit weekly days using Monday as 1 and Sunday as 7", () => {
    const template = { ...baseTemplate, recurrence_type: "weekly" as const, recurrence_days: [1, 3, 7] };

    expect(templateAppliesToDate(template, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-02")).toBe(false);
    expect(templateAppliesToDate(template, "2026-06-03")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-07")).toBe(true);
  });
});
