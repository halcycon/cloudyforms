/**
 * Domain routing middleware.
 *
 * Resolves the organisation associated with the incoming request. The site
 * hostname may arrive via Origin/Referer (Pages custom domain → shared worker
 * API) or directly on the Host header when the worker is addressed by a custom
 * domain.
 */

import { createMiddleware } from "hono/factory";
import { resolveDomainOrgId } from "../lib/domainContext";
import type { Bindings } from "../index";

declare module "hono" {
  interface ContextVariableMap {
    /** orgId resolved from the site hostname, if it matches a custom domain */
    domainOrgId: string | undefined;
  }
}

export const domainMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const orgId = await resolveDomainOrgId(c.env.DB, c);
    if (orgId) {
      c.set("domainOrgId", orgId);
    }
    await next();
  }
);
