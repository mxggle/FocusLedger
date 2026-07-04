import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { settle } from "../../utils/motion";

/**
 * Shared list-item choreography: new items settle in with a small rise,
 * removed items fade out quickly, and siblings glide to their new positions.
 *
 * Deliberately no scale — scaling shadowed cards blurs their text and shadow —
 * and `layout="position"` so reflow only ever moves items, never stretches
 * them (full `layout` distorts card contents when pane widths change).
 * Wrap items in `<AnimatePresence initial={false}>` and key by the item id.
 */
export const AnimatedListItem = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(function AnimatedListItem({ children, className }, ref) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      layout={reduce ? false : "position"}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.16, ease: "easeOut" } }}
      transition={settle}
      className={className}
    >
      {children}
    </motion.div>
  );
});
