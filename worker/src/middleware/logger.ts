import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";

/**
 * Request / response logger middleware.
 *
 * Emits two `console.log` lines per request that are visible via
 * `npx wrangler tail`:
 *
 *   → GET /api/forms?orgId=abc 200 42ms (user:xyz)
 *
 * All output uses `console.log` which Cloudflare Workers automatically
 * forwards to `wrangler tail` and Workers Logpush.
 */
export const loggerMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const query = c.req.query();
    const qs = Object.keys(query).length
      ? "?" + new URLSearchParams(query as Record<string, string>).toString()
      : "";
    const origin = c.req.header("Origin") ?? "-";
    const userAgent = c.req.header("User-Agent") ?? "-";

    console.log(
      `→ ${method} ${path}${qs} origin=${origin} ua=${userAgent.slice(0, 80)}`
    );

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    // After auth middleware runs the user variable may be set
    let userId = "-";
    try {
      const user = c.get("user");
      if (user?.userId) userId = user.userId;
    } catch {
      // user context not set (public routes)
    }

    console.log(
      `← ${method} ${path}${qs} ${status} ${duration}ms user=${userId}`
    );
  }
);
