import { z } from "zod";
import type { Category, CreateTaskInput } from "../../types";
import { generateText } from "./aiClient";
import type { AiSettings } from "./providers";

/**
 * Smart capture: turn a raw quick-add note into a structured task with one
 * low-temperature AI call. The forms send only the typed text; the model
 * fills in category, priority, estimate, and an explicit date if the text
 * names one. Everything is validated here — a bad model response throws and
 * callers fall back to a plain create so the user's input is never lost.
 */

export type SmartCaptureOptions = {
  text: string;
  categories: Pick<Category, "id" | "name">[];
  /** Today as YYYY-MM-DD, for resolving relative dates in the prompt. */
  today: string;
  /** Applied when the text doesn't name a date (today's list vs backlog). */
  defaultDueDate: string | null;
};

const responseSchema = z.object({
  title: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  estimated_minutes: z.number().nullable().optional(),
  due_date: z.string().nullable().optional()
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildSmartCaptureSystemPrompt(options: SmartCaptureOptions): string {
  const names = options.categories.map((category) => category.name).join(", ");
  return [
    "You convert one quick task note into structured fields. Reply with a single JSON object and nothing else:",
    '{"title": string, "category": string|null, "priority": "low"|"medium"|"high", "estimated_minutes": number|null, "due_date": "YYYY-MM-DD"|null}',
    "Rules:",
    "- title: a concise task title in the same language as the note. Remove words that became other fields (dates, priority, duration); never invent content.",
    `- category: the best match from this list, or null if none fits: ${names || "(none)"}.`,
    "- priority: high only for urgent/important wording, low for someday/minor wording, otherwise medium.",
    "- estimated_minutes: only when the note states or strongly implies a duration, else null.",
    `- due_date: only when the note names or implies a specific day (today is ${options.today}; resolve relative words like tomorrow or weekday names to YYYY-MM-DD). Otherwise null.`
  ].join("\n");
}

/**
 * Validates a raw model reply into CreateTaskInput. Pure so it is unit-testable
 * without a network. Throws on malformed JSON; individual bad fields are
 * dropped in favor of defaults instead of failing the whole capture.
 */
export function parseSmartCaptureResponse(
  raw: string,
  options: SmartCaptureOptions
): CreateTaskInput {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI reply contained no JSON object");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("AI reply was not valid JSON");
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success) throw new Error("AI reply did not match the expected shape");
  const fields = result.data;

  const title = fields.title?.trim() || options.text.trim();

  const categoryName = fields.category?.trim().toLowerCase();
  const category = categoryName
    ? options.categories.find((entry) => entry.name.trim().toLowerCase() === categoryName)
    : undefined;

  const estimate =
    typeof fields.estimated_minutes === "number" &&
    Number.isFinite(fields.estimated_minutes) &&
    fields.estimated_minutes > 0
      ? Math.round(fields.estimated_minutes)
      : null;

  const dueDate =
    typeof fields.due_date === "string" && DATE_RE.test(fields.due_date)
      ? fields.due_date
      : options.defaultDueDate;

  return {
    title,
    category_id: category?.id ?? null,
    priority: fields.priority ?? "medium",
    estimated_minutes: estimate,
    due_date: dueDate
  };
}

export async function smartCaptureTask(
  settings: AiSettings,
  options: SmartCaptureOptions
): Promise<CreateTaskInput> {
  const raw = await generateText(settings, {
    system: buildSmartCaptureSystemPrompt(options),
    prompt: options.text,
    maxTokens: 300,
    temperature: 0
  });
  return parseSmartCaptureResponse(raw, options);
}
