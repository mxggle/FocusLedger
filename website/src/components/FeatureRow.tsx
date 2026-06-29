import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Eyebrow } from "./ui/SectionHeading";
import { Reveal } from "./ui/Reveal";

export interface FeatureRowProps {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  points: string[];
  visual: ReactNode;
  /** Place the visual on the left instead of the right. */
  flip?: boolean;
}

export function FeatureRow({ id, eyebrow, title, description, points, visual, flip }: FeatureRowProps) {
  return (
    <div id={id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn(flip && "lg:order-2")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{description}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px]">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="text-foreground/90">{p}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.1} className={cn("relative", flip && "lg:order-1")}>
        <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 blur-2xl" />
        {visual}
      </Reveal>
    </div>
  );
}
