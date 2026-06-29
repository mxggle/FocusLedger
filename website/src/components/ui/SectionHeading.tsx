import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Reveal } from "./Reveal";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-soft-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center"
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={cn("flex flex-col gap-4", align === "center" ? "items-center text-center" : "items-start text-left")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[44px] md:leading-[1.1]">
        {title}
      </h2>
      {description ? (
        <p className={cn("max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg", align === "center" && "mx-auto")}>
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
