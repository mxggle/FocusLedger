import { Sparkles } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";

/** Opens the My Day review page from the Today Log pane. */
export function DebriefButton() {
  const requestRoute = useUiStore((state) => state.requestRoute);

  return (
    <Button
      type="button"
      size="sm"
      variant="soft"
      className="mb-4 w-full"
      onClick={() => requestRoute("my-day")}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      My Day
    </Button>
  );
}
