import { dbQueryFirst } from "./db";

/** Hostnames that are shared platform entry points, not org white-label sites. */
export function isCanonicalHost(host: string): boolean {
  return (
    !host ||
    host === "localhost" ||
    host.endsWith(".workers.dev") ||
    host.endsWith(".pages.dev")
  );
}

export function normalizeHost(value: string): string {
  return value.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function hostnameFromUrl(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

/**
 * Collect candidate site hostnames for org resolution.
 * Prefer browser-controlled Origin/Referer over the API Host header so that
 * Pages-hosted custom domains (frontend) calling a shared worker URL (API)
 * still resolve to the correct organisation.
 */
export function collectSiteHostCandidates(c: {
  req: {
    header: (name: string) => string | undefined;
  };
}): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (raw: string | undefined) => {
    if (!raw) return;
    const host = raw.includes("://") ? hostnameFromUrl(raw) : normalizeHost(raw);
    if (!host || seen.has(host)) return;
    seen.add(host);
    candidates.push(host);
  };

  add(c.req.header("Origin"));
  add(c.req.header("Referer"));
  add(c.req.header("X-CloudyForms-Site-Host"));
  add(c.req.header("Host"));

  return candidates;
}

export async function lookupOrgIdForHost(
  db: D1Database,
  host: string,
): Promise<string | undefined> {
  if (isCanonicalHost(host)) return undefined;

  const customDomain = await dbQueryFirst<{ org_id: string }>(
    db,
    "SELECT org_id FROM custom_domains WHERE domain = ? AND verified = 1",
    [host],
  );
  if (customDomain) return customDomain.org_id;

  const org = await dbQueryFirst<{ id: string }>(
    db,
    "SELECT id FROM organizations WHERE custom_domain = ?",
    [host],
  );
  return org?.id;
}

export async function resolveDomainOrgId(
  db: D1Database,
  c: { req: { header: (name: string) => string | undefined } },
): Promise<string | undefined> {
  for (const host of collectSiteHostCandidates(c)) {
    const orgId = await lookupOrgIdForHost(db, host);
    if (orgId) return orgId;
  }
  return undefined;
}
