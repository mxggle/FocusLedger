/**
 * A small, dependency-free Markdown parser for the assistant's short replies.
 * Produces a block/inline token tree that a React renderer walks — this keeps
 * parsing pure and unit-testable, and stops raw marks (**, `, 1.) from leaking
 * through to the UI as literal characters.
 *
 * Supported: ## / ### headings, unordered (-, *) and ordered (1.) lists,
 * paragraphs, and inline **bold**, *italic* / _italic_, and `code`.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; tokens: InlineToken[] }
  | { type: "paragraph"; tokens: InlineToken[] }
  | { type: "list"; ordered: boolean; items: InlineToken[][] };

// Order matters: code first (so backticks win over emphasis inside them),
// then bold (**) before single-char italic.
const INLINE_RE = /`([^`]+)`|\*\*([^*]+?)\*\*|\*([^*]+?)\*|_([^_]+?)_/;

/** Tokenize a single line of inline Markdown. Always returns at least one token. */
export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = input;

  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest);
    if (!match) {
      tokens.push({ type: "text", value: rest });
      break;
    }

    const index = match.index;
    if (index > 0) {
      tokens.push({ type: "text", value: rest.slice(0, index) });
    }

    if (match[1] !== undefined) tokens.push({ type: "code", value: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: "bold", value: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: "italic", value: match[3] });
    else if (match[4] !== undefined) tokens.push({ type: "italic", value: match[4] });

    rest = rest.slice(index + match[0].length);
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: "" }];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UNORDERED_RE = /^\s*[-*]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.*)$/;

/** Parse a block of Markdown into a flat list of renderable blocks. */
export function parseMarkdown(input: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = input.replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", tokens: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: "list",
      ordered: list.ordered,
      items: list.items.map((item) => parseInline(item))
    });
    list = null;
  };

  for (const line of lines) {
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length >= 3 ? 3 : 2;
      blocks.push({ type: "heading", level, tokens: parseInline(heading[2].trim()) });
      continue;
    }

    const unordered = UNORDERED_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const itemOrdered = Boolean(ordered);
      const text = (unordered ?? ordered)![1].trim();
      if (list && list.ordered !== itemOrdered) flushList();
      if (!list) list = { ordered: itemOrdered, items: [] };
      list.items.push(text);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}
