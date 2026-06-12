import { Sparkles } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";

/** Opens the daily debrief dialog from the Today Log pane. */
export function DebriefButton() {
  const setDebriefDialogOpen = useUiStore((state) => state.setDebriefDialogOpen);

  return (
    <Button
      type="button"
      size="sm"
      variant="soft"
      className="mb-4 w-full"
      onClick={() => setDebriefDialogOpen(true)}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      Daily debrief
    </Button>
  );
}
