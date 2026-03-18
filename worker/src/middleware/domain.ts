/**
 * Domain routing middleware.
 *
 * When a request arrives from a custom domain (e.g. forms.example.com) this
 * middleware looks the domain up in the custom_domains table and injects the
 * associated orgId into the Hono context so downstream handlers can filter
 * content to that organisation automatically.
 *
 * The variable is OPTIONAL – if the host is the canonical CloudyForms host the
 * variable will simply be absent and normal multi-org logic applies.
 */

import { createMiddleware } from "hono/factory";
import { dbQueryFirst } from "../lib/db";
import type { Bindings } from "../index";

declare module "hono" {
  interface ContextVariableMap {
    /** orgId resolved from the incoming Host header, if it matches a custom domain */
    domainOrgId: string | undefined;
  }
}

export const domainMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const host = (c.req.header("Host") ?? "").split(":")[0]?.toLowerCase() ?? "";

    // Skip for localhost / workers.dev / pages.dev – these are canonical hosts
    const isCanonical =
      !host ||
      host === "localhost" ||
      host.endsWith(".workers.dev") ||
      host.endsWith(".pages.dev");

    if (!isCanonical) {
      // Check the custom_domains table first (verified domains)
      const customDomain = await dbQueryFirst<{ org_id: string }>(
        c.env.DB,
        "SELECT org_id FROM custom_domains WHERE domain = ? AND verified = 1",
        [host]
      );

      if (customDomain) {
        c.set("domainOrgId", customDomain.org_id);
      } else {
        // Fall back to the legacy single custom_domain column on organizations
        const org = await dbQueryFirst<{ id: string }>(
          c.env.DB,
          "SELECT id FROM organizations WHERE custom_domain = ?",
          [host]
        );
        if (org) {
          c.set("domainOrgId", org.id);
        }
      }
    }

    await next();
  }
);
