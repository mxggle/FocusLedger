import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";

// React's act() expects this flag so it doesn't warn about a non-act environment.
const env = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
env.IS_REACT_ACT_ENVIRONMENT = true;

const mounts: { root: Root; container: HTMLDivElement }[] = [];

/** Mount a React node into a fresh jsdom container, flushing effects via act. */
export function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  act(() => {
    root.render(node);
  });
  return container;
}

export function fireClick(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export function fireKey(el: Element | Document, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

export function fireInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  act(() => {
    // React's controlled-input value tracker ignores a direct `.value` write;
    // go through the native prototype setter so onChange actually fires.
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Flush pending microtasks/effects (e.g. an async click handler) via act. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  for (const m of mounts) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounts.length = 0;
  vi.clearAllMocks();
});
