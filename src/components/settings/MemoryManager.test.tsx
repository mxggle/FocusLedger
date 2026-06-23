import { describe, expect, it, vi } from "vitest";
import { fireClick, flush, render } from "../assistant/_render";
import type { MemoryEntry } from "../../services/ai/assistant/memory/types";

const repo = vi.hoisted(() => ({
  getAll: vi.fn((): Promise<MemoryEntry[]> => Promise.resolve([])),
  setPinned: vi.fn((): Promise<void> => Promise.resolve()),
  archive: vi.fn((): Promise<void> => Promise.resolve()),
  restore: vi.fn((): Promise<void> => Promise.resolve()),
  updateText: vi.fn((): Promise<void> => Promise.resolve())
}));
vi.mock("../../db/assistantMemoryRepository", () => ({ assistantMemoryRepository: repo }));

import { MemoryManager } from "./MemoryManager";

function entry(p: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "preference", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z", ...p
  };
}

function findButton(c: HTMLElement, label: RegExp): HTMLButtonElement {
  const btn = Array.from(c.querySelectorAll("button")).find(
    (b) => label.test(b.getAttribute("aria-label") ?? "") || label.test(b.textContent ?? "")
  );
  if (!btn) throw new Error(`button ${label} not found`);
  return btn as HTMLButtonElement;
}

describe("MemoryManager", () => {
  it("lists learned memories", async () => {
    repo.getAll.mockResolvedValue([entry({ id: "a", text: "Prefers mornings" })]);
    const c = render(<MemoryManager />);
    await flush();
    await flush();
    expect(c.textContent).toContain("Prefers mornings");
  });

  it("forgets (archives) a memory", async () => {
    repo.getAll.mockResolvedValue([entry({ id: "a", text: "Likes spicy food" })]);
    const c = render(<MemoryManager />);
    await flush();
    await flush();
    fireClick(findButton(c, /forget/i));
    await flush();
    expect(repo.archive).toHaveBeenCalledWith("a", expect.any(String));
  });

  it("shows empty state when nothing learned", async () => {
    repo.getAll.mockResolvedValue([]);
    const c = render(<MemoryManager />);
    await flush();
    await flush();
    expect(c.textContent).toMatch(/hasn't learned anything/i);
  });
});
