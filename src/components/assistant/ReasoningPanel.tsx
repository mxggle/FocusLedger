import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "../ui/Skeleton";

type ReasoningPanelProps = {
  steps: string[];
  active: boolean;
};

export function ReasoningPanel({ steps, active }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(active);
  const label = active ? "Thinking" : "Thought process";
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground"
        aria-expanded={expanded}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
        {active ? (
          <span className="ml-1 flex items-center gap-0.5" aria-hidden="true">
            <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-1.5 pl-5">
          {active ? <ActiveSteps steps={steps} /> : <DoneSteps steps={steps} />}
        </div>
      ) : null}
    </div>
  );
}

function ActiveSteps({ steps }: { steps: string[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        Analyzing…
      </div>
    );
  }
  const completed = steps.slice(0, -1);
  const current = steps[steps.length - 1];
  return (
    <>
      {completed.map((step, index) => (
        <CompletedStep key={index} step={step} />
      ))}
      <div className="flex items-center gap-1.5 text-xs text-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        {current}
      </div>
      <Skeleton className="h-1 w-3/4 rounded-full" />
    </>
  );
}

function DoneSteps({ steps }: { steps: string[] }) {
  return (
    <>
      {steps.map((step, index) => (
        <CompletedStep key={index} step={step} />
      ))}
    </>
  );
}

function CompletedStep({ step }: { step: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3 w-3 shrink-0 text-success" />
      {step}
    </div>
  );
}
