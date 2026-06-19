import type { Task } from "../../../types";
import type { CalibrationStat, RetrospectiveInsights } from "../../retrospect/types";

/** A read-only request the model emits during the agent loop. */
export type LookupRequest = {
  tool: string;
  query?: string;
  category?: string;
  date?: string;
};

/** Everything the deterministic tools may read. Injected so tools stay pure. */
export type ToolDeps = {
  allTasks: Task[];
  insights: RetrospectiveInsights | null;
};

type AssistantTool = {
  name: string;
  when: string;
  params: string;
  execute: (req: LookupRequest, deps: ToolDeps) => string;
};

const MAX_SEARCH_RESULTS = 8;

function searchTasks(req: LookupRequest, deps: ToolDeps): string {
  const query = (req.query ?? "").trim().toLowerCase();
  if (query.length === 0) return "search_tasks: provide a non-empty query.";
  const terms = query.split(/\s+/);
  const scored = deps.allTasks
    .map((t) => {
      const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
      const score = terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
      return { t, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SEARCH_RESULTS);

  if (scored.length === 0) return `search_tasks("${req.query}"): no matching tasks.`;
  const lines = scored.map(
    ({ t }) => `- [${t.id}] "${t.title}" (${t.status}${t.due_date ? `, due ${t.due_date}` : ""})`
  );
  return [`search_tasks("${req.query}") found ${scored.length}:`, ...lines].join("\n");
}

function describeStat(stat: CalibrationStat): string {
  const pct = Math.round(stat.ratio * 100);
  const flag = stat.confidence === "low" ? " (low confidence — little history)" : "";
  return `${stat.scope}: actual is ${pct}% of estimate (ratio ${stat.ratio.toFixed(2)}, ${stat.sampleSize} tasks)${flag}`;
}

function getCalibration(req: LookupRequest, deps: ToolDeps): string {
  const calibration = deps.insights?.calibration;
  if (!calibration?.overall) return "get_calibration: no estimate history yet — use your own judgement.";
  const wanted = (req.category ?? "").trim().toLowerCase();
  if (wanted.length > 0) {
    const match = calibration.byCategory.find((s) => s.scope.toLowerCase() === wanted);
    if (match) return `get_calibration — ${describeStat(match)}`;
  }
  return `get_calibration — ${describeStat(calibration.overall)} (overall; no specific category match)`;
}

const TOOL_REGISTRY: Record<string, AssistantTool> = {
  search_tasks: {
    name: "search_tasks",
    when: "you need to check whether a task already exists (dedup) before creating one",
    params: "query (required, keywords)",
    execute: searchTasks
  },
  get_calibration: {
    name: "get_calibration",
    when: "you are about to set estimated_minutes and want to size it from real history",
    params: "category (optional, a category name; omit for the overall ratio)",
    execute: getCalibration
  }
};

/** Run one lookup. Never throws — returns an error string the model can read. */
export function executeLookup(req: LookupRequest, deps: ToolDeps): string {
  const tool = TOOL_REGISTRY[req.tool];
  if (!tool) return `Unknown tool "${req.tool}". Available: ${Object.keys(TOOL_REGISTRY).join(", ")}.`;
  try {
    return tool.execute(req, deps);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Tool "${req.tool}" failed: ${detail}`;
  }
}

/** Prompt fragment describing the read tools. */
export function toolCatalog(): string {
  return Object.values(TOOL_REGISTRY)
    .map((tool) => `- ${tool.name}: use when ${tool.when}. params: ${tool.params}`)
    .join("\n");
}
