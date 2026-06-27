/** A thin host-side callable exposed to the sandbox. The orchestrator adapts the real AgentTool
 * registry to this shape; the sandbox depends only on this minimal interface. */
export type HostTool = {
  name: string;
  execute: (args: unknown) => Promise<unknown>;
};

/** Options for runProgram. */
export type PtcOptions = {
  tools: HostTool[];
  /** Wall-clock deadline in ms. Default: 5000. */
  timeoutMs?: number;
  /** Maximum total tool calls the program may make. Default: 50. */
  maxCalls?: number;
  /** If the signal is aborted, the sandbox is interrupted immediately. */
  signal?: AbortSignal;
};

/** One recorded tool invocation made by the sandboxed program. */
export type PtcCallLog = {
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
};

/** The value returned by runProgram — never throws. */
export type PtcResult = {
  ok: boolean;
  /** The resolved return value of the program (JSON-serializable). */
  returnValue?: unknown;
  /** Lines written via log(). */
  logs: string[];
  /** One entry per tool call made by the program, in order. */
  calls: PtcCallLog[];
  /** Present when ok === false. */
  error?: string;
};
