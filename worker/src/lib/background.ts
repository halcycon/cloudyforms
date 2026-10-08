import type { Context } from "hono";
import type { Bindings } from "../index";

/**
 * Run async work after the HTTP response is sent.
 * Required on Cloudflare Workers so fetch/email I/O is not cut off when the handler returns.
 */
export function deferBackgroundTask(
  c: Context<{ Bindings: Bindings }>,
  task: Promise<unknown>,
  label?: string,
): void {
  const tracked = task.catch((err) => {
    console.error(label ? `[BACKGROUND] ${label} failed:` : "[BACKGROUND] Task failed:", err);
  });

  try {
    c.executionCtx.waitUntil(tracked);
  } catch {
    // No ExecutionContext (e.g. some test harnesses) — task still runs best-effort.
  }
}
