import { useEffect, useRef } from "react";
import { useUiStore } from "../stores/uiStore";

/**
 * Wire a task card to the transient "a change just landed" highlight. When the
 * assistant applies a change to this task, the card scrolls into view and the
 * returned `highlighted` flag drives a flash style. Works on any page that
 * renders the task (Today, Backlog, …).
 */
export function useTaskHighlight<T extends HTMLElement>(taskId: string) {
  const highlighted = useUiStore((state) => state.highlightedTaskId === taskId);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlighted]);

  return { ref, highlighted };
}
