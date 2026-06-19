import { Sparkles } from "lucide-react";

const STARTERS = [
  "Plan my day",
  "What should I focus on?",
  "Reschedule what I didn't finish to tomorrow"
];

export function AssistantEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Yolo Assistant</p>
        <p className="text-xs text-muted-foreground">
          Ask me to plan or adjust your day. I suggest changes — you approve them.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onPick(starter)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}
