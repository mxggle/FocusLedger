/**
 * PTC sandbox — runs an LLM-authored JS program in a QuickJS VM.
 *
 * ARCHITECTURE: sync evalCode + Deferred Promise + job-queue polling
 * ────────────────────────────────────────────────────────────────────
 * Host tools are exposed as synchronous `newFunction` callbacks that
 * immediately return a QuickJS Deferred Promise (`ctx.newPromise()`).
 * A microtask scheduled with `Promise.resolve().then()` performs the
 * async host work, resolves the deferred, then calls
 * `ctx.runtime.executePendingJobs()` to propagate the settled value
 * into the QuickJS microtask queue.
 *
 * The user program is evaluated with regular (sync) `evalCode`, which
 * returns a QuickJS Promise handle for any async function body. We pump
 * that promise to completion by polling:
 *   while (!settled) {
 *     ctx.runtime.executePendingJobs();   // run QuickJS jobs
 *     await Promise.resolve();            // yield to host microtask queue
 *   }
 *
 * WHY NOT evalCodeAsync / newAsyncifiedFunction:
 * Both use Emscripten Asyncify to suspend the WASM stack while awaiting.
 * Calling an asyncified host function from inside evalCodeAsync would
 * require unwinding the WASM stack twice — a constraint the library
 * explicitly forbids ("Asyncified functions must never call other
 * asyncified functions"). The result is ref-count assertion failures and
 * WASM memory corruption on the second call in a loop. The polling
 * approach avoids Asyncify entirely.
 *
 * RESULT PROTOCOL (host → sandbox via JSON string):
 *   success: `{"__ok":true,"v":<result>}`
 *   error:   `{"__ok":false,"e":<message>}`
 * A JS wrapper inside the sandbox decodes this and re-throws for errors.
 *
 * DEFERRED PROMISE LIFETIME:
 * Per the QuickJS-emscripten docs: "As the return value of a
 * VmFunctionImplementation, return `handle`, and ensure that either
 * `resolve` or `reject` will be called. No other clean-up is necessary."
 * We return `deferred.handle` directly (no `dup()`). The microtask then
 * calls `deferred.resolve(handle)` which auto-disposes the callback
 * handles.
 */

import { newAsyncContext, shouldInterruptAfterDeadline } from "quickjs-emscripten";
import type { QuickJSAsyncContext, QuickJSHandle } from "quickjs-emscripten";
import type { HostTool, PtcCallLog, PtcOptions, PtcResult } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_CALLS = 50;

/** Wrap user code so bare `return <value>` works inside an async IIFE. */
function wrapCode(code: string): string {
  return `(async function __ptc__() { ${code} })()`;
}

/**
 * Build the JS snippet installed inside the sandbox.
 * Each raw tool returns a JSON-encoded protocol string via a QuickJS Promise.
 * The wrapper decodes it and re-throws on error so user code can catch.
 */
function buildWrappers(toolNames: string[]): string {
  if (toolNames.length === 0) return "void 0;";
  return toolNames
    .map(
      (name) => `
(function() {
  const __raw = ${name};
  globalThis.${name} = async function(args) {
    const raw = await __raw(args);
    const r = JSON.parse(raw);
    if (!r.__ok) throw new Error(r.e);
    return r.v;
  };
})();`
    )
    .join("\n");
}

/**
 * Poll the QuickJS job queue until the native promise settles.
 * Interleaves `executePendingJobs` with host microtask yields so that
 * host-side deferred resolutions can run between pump cycles.
 */
async function pumpUntilSettled(
  vm: QuickJSAsyncContext,
  p: Promise<unknown>,
  deadlineMs: number
): Promise<void> {
  let settled = false;
  p.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  while (!settled && Date.now() < deadlineMs) {
    vm.runtime.executePendingJobs();
    if (!settled) await Promise.resolve();
  }
}

/**
 * Execute a sandboxed JS program with access only to the provided host tools
 * and a log() helper. Never throws — all in-sandbox errors are captured and
 * returned as { ok: false, error }.
 */
export async function runProgram(code: string, opts: PtcOptions): Promise<PtcResult> {
  const logs: string[] = [];
  const calls: PtcCallLog[] = [];

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS;

  // Honor a pre-aborted signal immediately — no QuickJS context needed.
  if (opts.signal?.aborted) {
    return { ok: false, error: "aborted", logs, calls };
  }

  let vm: QuickJSAsyncContext | undefined;

  try {
    vm = await newAsyncContext();

    // ---- Interrupt handler: wall-clock deadline + optional AbortSignal ----
    const deadline = Date.now() + timeoutMs;
    let abortedBySignal = false;

    const deadlineInterrupt = shouldInterruptAfterDeadline(deadline);

    const onAbort = () => {
      abortedBySignal = true;
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    vm.runtime.setInterruptHandler((rt) => {
      if (abortedBySignal) return true;
      return deadlineInterrupt(rt) ?? false;
    });

    // ---- Expose log() global (sync) ----
    const logFn = vm.newFunction("log", (...argHandles: QuickJSHandle[]) => {
      const parts = argHandles.map((h) => {
        const v = vm!.dump(h);
        return typeof v === "string" ? v : JSON.stringify(v);
      });
      logs.push(parts.join(" "));
    });
    vm.setProp(vm.global, "log", logFn);
    logFn.dispose();

    // ---- Expose each tool as a sync function returning a Deferred Promise ----
    // See module-level docstring for the lifecycle and protocol details.
    let callCount = 0;

    for (const tool of opts.tools) {
      const toolName = tool.name;

      const toolFn = vm.newFunction(toolName, (...argHandles: QuickJSHandle[]) => {
        const rawArgs = argHandles[0] !== undefined ? vm!.dump(argHandles[0]) : undefined;

        // Cap check: record and immediately resolve with error protocol.
        if (callCount >= maxCalls) {
          const msg = `Tool call limit reached: maxCalls cap of ${maxCalls} exceeded`;
          calls.push({ name: toolName, args: rawArgs, error: msg });
          const deferred = vm!.newPromise();
          const handle = vm!.newString(JSON.stringify({ __ok: false, e: msg }));
          deferred.resolve(handle);
          handle.dispose();
          vm!.runtime.executePendingJobs();
          // Per docs: return handle and ensure resolve was called. ✓
          return deferred.handle;
        }

        const callLog: PtcCallLog = { name: toolName, args: rawArgs };
        calls.push(callLog);
        callCount += 1;

        const deferred = vm!.newPromise();

        // Microtask: run the async host work, then resolve the deferred.
        // All QuickJS allocations happen here, outside any Asyncify context.
        void Promise.resolve().then(async () => {
          if (!vm?.runtime.alive) return;
          try {
            const hostResult = await tool.execute(rawArgs);
            callLog.result = hostResult;
            const json = JSON.stringify({ __ok: true, v: hostResult ?? null });
            const handle = vm!.newString(json);
            deferred.resolve(handle);
            handle.dispose();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            callLog.error = msg;
            const json = JSON.stringify({ __ok: false, e: msg });
            const handle = vm!.newString(json);
            // Resolve with error protocol — the wrapper re-throws so code can catch.
            deferred.resolve(handle);
            handle.dispose();
          } finally {
            // Pump so QuickJS picks up the settled promise.
            vm!.runtime.executePendingJobs();
          }
        });

        // Per docs: return handle and ensure resolve will be called. ✓
        return deferred.handle;
      });

      vm.setProp(vm.global, toolName, toolFn);
      toolFn.dispose();
    }

    // ---- Install sandbox-side wrappers that decode the JSON protocol ----
    const wrapResult = vm.evalCode(buildWrappers(opts.tools.map((t) => t.name)));
    const wrapErr = "error" in wrapResult ? wrapResult.error : undefined;
    if (wrapErr) {
      const errMsg = extractError(vm, wrapErr);
      wrapErr.dispose();
      opts.signal?.removeEventListener("abort", onAbort);
      return { ok: false, error: `sandbox setup error: ${errMsg}`, logs, calls };
    }
    if ("value" in wrapResult) wrapResult.value.dispose();

    // ---- Evaluate the user program ----
    // Regular evalCode: async code returns a QuickJS Promise handle.
    const evalResult = vm.evalCode(wrapCode(code));

    const evalErr = "error" in evalResult ? evalResult.error : undefined;
    if (evalErr) {
      // Syntax error or synchronous throw at the top level.
      const errMsg = extractError(vm, evalErr);
      evalErr.dispose();
      opts.signal?.removeEventListener("abort", onAbort);
      return { ok: false, error: classifyError(errMsg, abortedBySignal, deadline), logs, calls };
    }

    // evalResult.value is a QuickJS Promise handle for the async function body.
    // resolvePromise subscribes to it via .then(); we pump the job queue in a
    // polling loop so the promise can settle interleaved with host microtasks.
    const promiseHandle = "value" in evalResult ? evalResult.value : undefined;
    if (!promiseHandle) {
      opts.signal?.removeEventListener("abort", onAbort);
      return { ok: false, error: "sandbox produced no result value", logs, calls };
    }
    const promiseFuture = vm.resolvePromise(promiseHandle);

    await pumpUntilSettled(vm, promiseFuture, deadline + 500);

    opts.signal?.removeEventListener("abort", onAbort);

    const resolved = await promiseFuture;
    promiseHandle.dispose();

    const resolvedErr = "error" in resolved ? resolved.error : undefined;
    if (resolvedErr) {
      const errMsg = extractError(vm, resolvedErr);
      resolvedErr.dispose();
      return { ok: false, error: classifyError(errMsg, abortedBySignal, deadline), logs, calls };
    }

    const valueHandle = "value" in resolved ? resolved.value : undefined;
    const returnValue = valueHandle ? vm.dump(valueHandle) : null;
    valueHandle?.dispose();

    return { ok: true, returnValue: returnValue ?? null, logs, calls };
  } catch (outerErr) {
    // Unexpected host-side error (e.g. WASM init failure, unhandled rejection).
    const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return { ok: false, error: msg, logs, calls };
  } finally {
    // Always dispose to prevent WASM memory leaks.
    vm?.dispose();
  }
}

/** Map a raw QuickJS error string to a user-readable label. */
function classifyError(errMsg: string, aborted: boolean, deadline: number): string {
  if (aborted) return "aborted";
  const lower = errMsg.toLowerCase();
  if (lower.includes("interrupt") || Date.now() >= deadline) {
    return "timeout: execution interrupted";
  }
  return errMsg;
}

/** Extract a readable string from a QuickJS error handle. */
function extractError(vm: QuickJSAsyncContext, handle: QuickJSHandle): string {
  try {
    const dumped = vm.dump(handle);
    if (dumped !== null && typeof dumped === "object") {
      const rec = dumped as Record<string, unknown>;
      if (typeof rec["message"] === "string") {
        const name = typeof rec["name"] === "string" ? rec["name"] : "Error";
        return `${name}: ${rec["message"]}`;
      }
    }
    return String(dumped ?? "unknown error");
  } catch {
    return "unknown error";
  }
}
