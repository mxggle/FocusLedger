import { Fragment } from "react";
import { parseMarkdown, type InlineToken } from "../../utils/markdown";

/**
 * Renders the assistant's constrained Markdown using the pure parser in
 * utils/markdown. Replaces literal marks (**, `, 1.) with real formatting.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = parseMarkdown(content);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 2 ? "h4" : "h5";
          return (
            <Tag
              key={index}
              className="text-xs font-semibold uppercase tracking-wide text-primary/80"
            >
              <Inline tokens={block.tokens} />
            </Tag>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={index}
              className={
                (block.ordered ? "list-decimal" : "list-disc") + " space-y-1 pl-5 marker:text-muted-foreground"
              }
            >
              {block.items.map((tokens, itemIndex) => (
                <li key={itemIndex}>
                  <Inline tokens={tokens} />
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={index}>
            <Inline tokens={block.tokens} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "bold":
            return (
              <strong key={index} className="font-semibold text-foreground">
                {token.value}
              </strong>
            );
          case "italic":
            return (
              <em key={index} className="italic">
                {token.value}
              </em>
            );
          case "code":
            return (
              <code
                key={index}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em] text-foreground"
              >
                {token.value}
              </code>
            );
          default:
            return <Fragment key={index}>{token.value}</Fragment>;
        }
      })}
    </>
  );
}
