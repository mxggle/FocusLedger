import { describe, expect, it, vi } from "vitest";
import { fireClick, fireInput, flush, render } from "../assistant/_render";
import type { MemoryEntry } from "../../services/ai/assistant/memory/types";

const repo = vi.hoisted(() => ({
  getAll: vi.fn((): Promise<MemoryEntry[]> => Promise.resolve([])),
  add: vi.fn((): Promise<void> => Promise.resolve()),
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

// The dialog is portaled to document.body, so query there (covers the trigger too).
function findButton(label: RegExp, root: ParentNode = document.body): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll("button")).find(
    (b) => label.test(b.getAttribute("aria-label") ?? "") || label.test(b.textContent ?? "")
  );
  if (!btn) throw new Error(`button ${label} not found`);
  return btn as HTMLButtonElement;
}

/** Render the manager and open the management dialog. */
async function open(entries: MemoryEntry[]): Promise<void> {
  repo.getAll.mockResolvedValue(entries);
  render(<MemoryManager />);
  await flush();
  await flush();
  fireClick(findButton(/manage memories/i));
  await flush();
}

describe("MemoryManager", () => {
  it("summarizes learned memories on the trigger", async () => {
    repo.getAll.mockResolvedValue([
      entry({ id: "a", text: "Prefers mornings", pinned: true }),
      entry({ id: "b", text: "Likes spicy food" })
    ]);
    const c = render(<MemoryManager />);
    await flush();
    await flush();
    expect(c.textContent).toMatch(/2 memories/i);
    expect(c.textContent).toMatch(/1 pinned/i);
  });

  it("lists learned memories in the dialog", async () => {
    await open([entry({ id: "a", text: "Prefers mornings" })]);
    expect(document.body.textContent).toContain("Prefers mornings");
  });

  it("forgets (archives) a memory", async () => {
    await open([entry({ id: "a", text: "Likes spicy food" })]);
    fireClick(findButton(/forget/i));
    await flush();
    expect(repo.archive).toHaveBeenCalledWith("a", expect.any(String));
  });

  it("shows empty state when nothing learned", async () => {
    await open([]);
    expect(document.body.textContent).toMatch(/hasn't learned anything/i);
  });

  it("AI-MEM-09: pins a memory and persists via setPinned", async () => {
    await open([entry({ id: "a", text: "Prefers mornings" })]);
    fireClick(findButton(/^pin$/i));
    await flush();
    expect(repo.setPinned).toHaveBeenCalledWith("a", true, expect.any(String));
  });

  it("AI-MEM-09: restores a forgotten (archived) memory and persists via restore", async () => {
    await open([entry({ id: "a", text: "Old project", status: "archived" })]);
    fireClick(findButton(/restore/i));
    await flush();
    expect(repo.restore).toHaveBeenCalledWith("a", expect.any(String));
  });

  it("edits a memory and persists via updateText", async () => {
    await open([entry({ id: "a", text: "Prefers mornings" })]);
    fireClick(findButton(/^edit$/i));
    await flush();
    const textarea = document.body.querySelector("textarea") as HTMLTextAreaElement;
    fireInput(textarea, "Prefers late nights");
    await flush();
    fireClick(findButton(/^save$/i));
    await flush();
    expect(repo.updateText).toHaveBeenCalledWith(
      "a",
      "Prefers late nights",
      "preference",
      expect.any(String)
    );
  });

  it("adds a user-authored memory via add", async () => {
    await open([]);
    fireClick(findButton(/add memory/i));
    await flush();
    const textarea = document.body.querySelector("textarea") as HTMLTextAreaElement;
    fireInput(textarea, "Drinks coffee black");
    await flush();
    fireClick(findButton(/^add$/i));
    await flush();
    expect(repo.add).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Drinks coffee black", kind: "preference", pinned: true })
    );
  });
});
