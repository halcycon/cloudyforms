/**
 * Custom-domain management routes.
 *
 * Per-org endpoints (admin/owner role required):
 *   GET    /api/orgs/:orgId/domains          – list domains for an org
 *   POST   /api/orgs/:orgId/domains          – add a domain (starts unverified)
 *   DELETE /api/orgs/:orgId/domains/:id      – remove a domain
 *   POST   /api/orgs/:orgId/domains/:id/verify – attempt DNS verification
 *   PATCH  /api/orgs/:orgId/domains/:id/primary – set as primary domain for org
 *
 * Super-admin global endpoints:
 *   GET    /api/admin/domains                – list ALL domains (all orgs)
 *   DELETE /api/admin/domains/:id           – remove any domain
 *   PATCH  /api/admin/domains/:id/verify    – force-verify a domain
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireRole } from "../middleware/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { generateId } from "../lib/auth";
import type { Bindings } from "../index";

// ── helpers ────────────────────────────────────────────────────────────────

function generateVerificationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Resolve a DNS TXT record via Cloudflare's DNS-over-HTTPS. */
async function lookupDnsTxt(domain: string): Promise<string[]> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=_cloudyforms.${domain}&type=TXT`;
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      Answer?: { data: string }[];
    };
    return (json.Answer ?? []).map((a) =>
      a.data.replace(/^"|"$/g, "")
    );
  } catch {
    return [];
  }
}

// ── per-org router ─────────────────────────────────────────────────────────

export const orgDomainRoutes = new Hono<{ Bindings: Bindings }>();

// All per-org routes require at least admin role
orgDomainRoutes.use("*", authMiddleware);

/** List domains for an organisation. */
orgDomainRoutes.get("/:orgId/domains", requireRole("admin"), async (c) => {
  const { orgId } = c.req.param();
  const domains = await dbQuery<{
    id: string;
    domain: string;
    verified: number;
    verification_token: string;
    is_primary: number;
    created_at: string;
  }>(
    c.env.DB,
    "SELECT id, domain, verified, verification_token, is_primary, created_at FROM custom_domains WHERE org_id = ? ORDER BY created_at DESC",
    [orgId]
  );
  return c.json(
    domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      verified: d.verified === 1,
      verificationToken: d.verification_token,
      isPrimary: d.is_primary === 1,
      dnsInstructions: {
        type: "TXT",
        name: `_cloudyforms.${d.domain}`,
        value: `cloudyforms-verification=${d.verification_token}`,
      },
      createdAt: d.created_at,
    }))
  );
});

/** Add a new (unverified) domain to an organisation. */
orgDomainRoutes.post(
  "/:orgId/domains",
  requireRole("admin"),
  zValidator(
    "json",
    z.object({
      domain: z
        .string()
        .min(3)
        .regex(
          /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i,
          "Invalid domain name"
        )
        .transform((d) => d.toLowerCase()),
    })
  ),
  async (c) => {
    const { orgId } = c.req.param();
    const { domain } = c.req.valid("json");

    // Check uniqueness
    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM custom_domains WHERE domain = ?",
      [domain]
    );
    if (existing) {
      return c.json({ error: "Domain already registered" }, 409);
    }

    const id = generateId();
    const token = generateVerificationToken();
    await dbRun(
      c.env.DB,
      "INSERT INTO custom_domains (id, org_id, domain, verification_token) VALUES (?, ?, ?, ?)",
      [id, orgId, domain, token]
    );

    return c.json(
      {
        id,
        domain,
        verified: false,
        verificationToken: token,
        isPrimary: false,
        dnsInstructions: {
          type: "TXT",
          name: `_cloudyforms.${domain}`,
          value: `cloudyforms-verification=${token}`,
        },
        createdAt: new Date().toISOString(),
      },
      201
    );
  }
);

/** Attempt to verify a domain by checking its DNS TXT record. */
orgDomainRoutes.post(
  "/:orgId/domains/:id/verify",
  requireRole("admin"),
  async (c) => {
    const { orgId, id } = c.req.param();

    const row = await dbQueryFirst<{
      domain: string;
      verification_token: string;
      verified: number;
    }>(
      c.env.DB,
      "SELECT domain, verification_token, verified FROM custom_domains WHERE id = ? AND org_id = ?",
      [id, orgId]
    );

    if (!row) return c.json({ error: "Domain not found" }, 404);
    if (row.verified === 1) return c.json({ verified: true, message: "Already verified" });

    const records = await lookupDnsTxt(row.domain);
    const expectedValue = `cloudyforms-verification=${row.verification_token}`;
    const isVerified = records.some((r) => r === expectedValue);

    if (isVerified) {
      await dbRun(
        c.env.DB,
        "UPDATE custom_domains SET verified = 1, updated_at = datetime('now') WHERE id = ?",
        [id]
      );
    }

    return c.json({
      verified: isVerified,
      message: isVerified
        ? "Domain verified successfully"
        : `DNS TXT record not found yet. Add: ${expectedValue} to _cloudyforms.${row.domain}`,
    });
  }
);

/** Set a domain as the primary domain for an org (used in branding links). */
orgDomainRoutes.patch(
  "/:orgId/domains/:id/primary",
  requireRole("admin"),
  async (c) => {
    const { orgId, id } = c.req.param();

    const row = await dbQueryFirst<{ verified: number }>(
      c.env.DB,
      "SELECT verified FROM custom_domains WHERE id = ? AND org_id = ?",
      [id, orgId]
    );
    if (!row) return c.json({ error: "Domain not found" }, 404);
    if (row.verified !== 1) return c.json({ error: "Domain must be verified before setting as primary" }, 400);

    // Clear existing primary flag for this org, then set the new one
    await dbRun(
      c.env.DB,
      "UPDATE custom_domains SET is_primary = 0, updated_at = datetime('now') WHERE org_id = ?",
      [orgId]
    );
    await dbRun(
      c.env.DB,
      "UPDATE custom_domains SET is_primary = 1, updated_at = datetime('now') WHERE id = ?",
      [id]
    );

    return c.json({ message: "Primary domain updated" });
  }
);

/** Delete a custom domain from an org. */
orgDomainRoutes.delete(
  "/:orgId/domains/:id",
  requireRole("admin"),
  async (c) => {
    const { orgId, id } = c.req.param();
    const row = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM custom_domains WHERE id = ? AND org_id = ?",
      [id, orgId]
    );
    if (!row) return c.json({ error: "Domain not found" }, 404);
    await dbRun(c.env.DB, "DELETE FROM custom_domains WHERE id = ?", [id]);
    return c.json({ message: "Domain removed" });
  }
);

// ── super-admin global router ───────────────────────────────────────────────

export const adminDomainRoutes = new Hono<{ Bindings: Bindings }>();

adminDomainRoutes.use("*", authMiddleware);

// Ensure caller is a super-admin
adminDomainRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user?.isSuperAdmin) {
    return c.json({ error: "Super admin access required" }, 403);
  }
  await next();
});

/** List all custom domains across all organisations. */
adminDomainRoutes.get("/", async (c) => {
  const domains = await dbQuery<{
    id: string;
    org_id: string;
    org_name: string;
    domain: string;
    verified: number;
    is_primary: number;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT cd.id, cd.org_id, o.name AS org_name, cd.domain, cd.verified, cd.is_primary, cd.created_at
       FROM custom_domains cd
       JOIN organizations o ON o.id = cd.org_id
       ORDER BY cd.created_at DESC`,
    []
  );
  return c.json(
    domains.map((d) => ({
      id: d.id,
      orgId: d.org_id,
      orgName: d.org_name,
      domain: d.domain,
      verified: d.verified === 1,
      isPrimary: d.is_primary === 1,
      createdAt: d.created_at,
    }))
  );
});

/** Force-verify a domain (super admin only). */
adminDomainRoutes.patch("/:id/verify", async (c) => {
  const { id } = c.req.param();
  const row = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM custom_domains WHERE id = ?",
    [id]
  );
  if (!row) return c.json({ error: "Domain not found" }, 404);
  await dbRun(
    c.env.DB,
    "UPDATE custom_domains SET verified = 1, updated_at = datetime('now') WHERE id = ?",
    [id]
  );
  return c.json({ message: "Domain force-verified" });
});

/** Delete any domain (super admin only). */
adminDomainRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const row = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM custom_domains WHERE id = ?",
    [id]
  );
  if (!row) return c.json({ error: "Domain not found" }, 404);
  await dbRun(c.env.DB, "DELETE FROM custom_domains WHERE id = ?", [id]);
  return c.json({ message: "Domain deleted" });
});
