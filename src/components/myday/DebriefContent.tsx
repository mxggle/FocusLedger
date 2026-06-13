/**
 * Minimal renderer for the debrief's constrained Markdown (## headings,
 * paragraphs, simple lists) — avoids pulling in a full Markdown library.
 */
export function DebriefContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("## ")) {
          const [heading, ...rest] = trimmed.split("\n");
          return (
            <div key={index} className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                {heading.replace(/^##\s+/, "")}
              </h4>
              {rest.length > 0 ? (
                <p className="text-sm leading-relaxed text-foreground">
                  {rest.join(" ")}
                </p>
              ) : null}
            </div>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <ul
              key={index}
              className="list-disc space-y-1 pl-5 text-sm text-foreground"
            >
              {trimmed.split("\n").map((line, lineIndex) => (
                <li key={lineIndex}>{line.replace(/^-\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-sm leading-relaxed text-foreground">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
