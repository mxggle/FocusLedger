import { describe, expect, it } from "vitest";
import { findCategoryIdByName } from "./categoryResolve";
import type { Category } from "../types";

const cats: Category[] = [
  { id: "c1", name: "Deep Work", color: null, created_at: "", updated_at: "" },
  { id: "c2", name: "Errands", color: null, created_at: "", updated_at: "" }
];

describe("findCategoryIdByName", () => {
  it("matches case-insensitively and trims", () => {
    expect(findCategoryIdByName(cats, "  deep WORK ")).toBe("c1");
  });

  it("returns null when there is no match", () => {
    expect(findCategoryIdByName(cats, "Apartment Move")).toBeNull();
  });

  it("returns null for an empty name", () => {
    expect(findCategoryIdByName(cats, "   ")).toBeNull();
  });
});
