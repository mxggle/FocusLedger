import { describe, expect, it, vi } from "vitest";
import { fireClick, fireKey, render } from "../assistant/_render";
import { act } from "react";

// The panels themselves talk to the DB-backed stores; this suite is about the
// tab shell, so stand them in with markers.
vi.mock("./sections/GeneralSettings", () => ({
  GeneralSettings: () => <div>general-panel</div>
}));
vi.mock("./sections/CategoriesSettings", () => ({
  CategoriesSettings: () => <div>categories-panel</div>
}));
vi.mock("./sections/RestSettings", () => ({ RestSettings: () => <div>rest-panel</div> }));
vi.mock("./sections/AssistantSettings", () => ({
  AssistantSettings: () => <div>assistant-panel</div>
}));
vi.mock("./sections/SystemSettings", () => ({ SystemSettings: () => <div>system-panel</div> }));

import { useUiStore } from "../../stores/uiStore";
import { SettingsPage } from "./SettingsPage";

function tab(container: HTMLElement, label: string): HTMLElement {
  const found = Array.from(container.querySelectorAll('[role="tab"]')).find(
    (el) => el.textContent?.trim() === label
  );
  if (!found) throw new Error(`tab ${label} not found`);
  return found as HTMLElement;
}

describe("SettingsPage tabs", () => {
  it("shows only the active tab's panel", () => {
    localStorage.clear();
    const c = render(<SettingsPage />);
    expect(c.textContent).toContain("general-panel");
    expect(c.textContent).not.toContain("assistant-panel");

    fireClick(tab(c, "Assistant"));
    expect(c.textContent).toContain("assistant-panel");
    expect(c.textContent).not.toContain("general-panel");
    expect(tab(c, "Assistant").getAttribute("aria-selected")).toBe("true");
  });

  it("moves between tabs with the arrow keys", () => {
    localStorage.clear();
    const c = render(<SettingsPage />);
    fireKey(tab(c, "General"), "ArrowRight");
    expect(c.textContent).toContain("categories-panel");
    fireKey(tab(c, "Categories"), "ArrowLeft");
    expect(c.textContent).toContain("general-panel");
    fireKey(tab(c, "General"), "End");
    expect(c.textContent).toContain("system-panel");
  });

  it("opens the tab a deep link asks for, then clears the request", () => {
    localStorage.clear();
    act(() => {
      useUiStore.getState().requestSettingsTab("assistant");
    });
    const c = render(<SettingsPage />);
    expect(c.textContent).toContain("assistant-panel");
    expect(useUiStore.getState().requestedSettingsTab).toBeNull();
  });

  it("remembers the last tab across visits", () => {
    localStorage.clear();
    const first = render(<SettingsPage />);
    fireClick(tab(first, "Rest"));
    expect(render(<SettingsPage />).textContent).toContain("rest-panel");
  });
});
