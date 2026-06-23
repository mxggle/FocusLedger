import { CalendarClock, CalendarRange, ListChecks, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

type Intent = {
  label: string;
  sublabel: string;
  prompt: string;
  icon: ComponentType<{ className?: string }>;
};

const INTENTS: Intent[] = [
  {
    label: "Plan my day",
    sublabel: "Lay out a focus plan for today",
    prompt: "Plan my day",
    icon: CalendarRange
  },
  {
    label: "How is today looking?",
    sublabel: "Check the shape of your day",
    prompt: "How is today looking?",
    icon: Sparkles
  },
  {
    label: "Break down a goal",
    sublabel: "e.g. launch the new landing page this week",
    prompt: "Break down: launch the new landing page this week",
    icon: ListChecks
  },
  {
    label: "Reschedule overflow",
    sublabel: "Move unfinished tasks to tomorrow",
    prompt: "Reschedule what I didn't finish to tomorrow",
    icon: CalendarClock
  }
];

export function AssistantEmptyState({
  name,
  onPick
}: {
  name: string;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">
          Ask me to plan or adjust your day. I suggest changes — you approve them.
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        {INTENTS.map((intent) => {
          const Icon = intent.icon;
          return (
            <button
              key={intent.label}
              type="button"
              onClick={() => onPick(intent.prompt)}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{intent.label}</span>
              <span className="text-xs text-muted-foreground">{intent.sublabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
