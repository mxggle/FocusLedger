import { Bot, Lock, Plug, Terminal } from "lucide-react";
import { Reveal } from "./ui/Reveal";
import { SectionHeading } from "./ui/SectionHeading";

const CONFIG = `{
  "mcpServers": {
    "yolo": {
      "command": "node",
      "args": ["/path/to/yolo/mcp/dist/index.js"],
      "env": { "YOLO_MCP_READONLY": "1" }
    }
  }
}`;

const CLIENTS = ["Claude Desktop", "Claude Code", "Cursor", "Hermes Agent", "Open Claw", "Any MCP client"];

export function McpShowcase() {
  return (
    <section id="mcp" className="relative border-t border-border bg-surface-2/40 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow={
            <>
              <Plug size={13} /> AI-native
            </>
          }
          title="Your time, open to your agents"
          description="Yolo ships an MCP server that exposes your tasks and time records over a standard protocol. Point an agent — Claude Desktop, Cursor, or autonomous runners like Hermes Agent and Open Claw — at it, and hand off the work: let them plan, reschedule, and log focus on your behalf."
        />

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          {/* code block */}
          <Reveal>
            <div className="overflow-hidden rounded-xl border border-border-strong bg-[#0d1424] shadow-pop">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <Terminal size={14} className="text-cyan-300" />
                <span className="text-xs font-medium text-slate-300">claude_desktop_config.json</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
                <code className="font-mono text-slate-200">{CONFIG}</code>
              </pre>
              <div className="space-y-2 border-t border-white/10 px-5 py-3 text-[12px] text-slate-400">
                <p>
                  Drop in the config and ask <span className="text-slate-200">“where did my time go today?”</span> — or omit{" "}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">YOLO_MCP_READONLY</code> to let it{" "}
                  <span className="text-slate-200">add, start, complete</span> tasks too.
                </p>
                <p className="text-slate-500">
                  Tools: <span className="font-mono text-cyan-300/80">list_tasks · daily_summary · add_task · start_task · complete_task</span>
                </p>
              </div>
            </div>
          </Reveal>

          {/* points */}
          <Reveal delay={0.1} className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Bot size={20} />
              </span>
              <div>
                <h4 className="text-base font-bold">Hand off to the agents you run</h4>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Claude Desktop, Claude Code, Cursor, and autonomous runners like Hermes Agent and Open Claw connect
                  in seconds — then do the planning and logging for you.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CLIENTS.map((c) => (
                    <span key={c} className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success-soft-foreground">
                <Lock size={18} />
              </span>
              <div>
                <h4 className="text-base font-bold">Read-only when you want it</h4>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Flip a single environment variable for a read-only server — agents can analyze your time without changing
                  anything.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Sparkle />
              </span>
              <div>
                <h4 className="text-base font-bold">Numbers stay honest</h4>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Totals and calibration are computed deterministically and only narrated by the model — so the answers are
                  grounded in your real records.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Sparkle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    </svg>
  );
}
