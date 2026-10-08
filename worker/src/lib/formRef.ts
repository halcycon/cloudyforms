import { dbQueryFirst } from "./db";

/**
 * Public form references.
 *
 * Form slugs are unique per organisation, so a public reference is either:
 *   - "orgSlug/formSlug" — works on any host (primary domain, embeds), or
 *   - "formSlug"         — resolved within the org that owns the request's
 *                          custom domain.
 * On the primary domain a bare slug falls back to the oldest form with that
 * slug, so links created before slugs were per-org keep working.
 */

/** Build a ref from route params registered as `/:slugOrOrg/:slug?`. */
export function formRefFromParams(params: { slugOrOrg?: string; slug?: string }): string {
  return params.slug ? `${params.slugOrOrg}/${params.slug}` : (params.slugOrOrg ?? "");
}

export async function findFormByRef<T>(
  db: D1Database,
  ref: string,
  domainOrgId: string | undefined,
  columns = "*",
): Promise<T | null> {
  const parts = ref.split("/");
  if (parts.length === 2) {
    const [orgSlug, formSlug] = parts;
    return dbQueryFirst<T>(
      db,
      `SELECT ${columns} FROM forms
       WHERE org_id = (SELECT id FROM organizations WHERE slug = ?) AND slug = ?`,
      [orgSlug, formSlug],
    );
  }
  if (parts.length !== 1 || !ref) return null;

  if (domainOrgId) {
    return dbQueryFirst<T>(
      db,
      `SELECT ${columns} FROM forms WHERE org_id = ? AND slug = ?`,
      [domainOrgId, ref],
    );
  }

  return dbQueryFirst<T>(
    db,
    `SELECT ${columns} FROM forms WHERE slug = ? ORDER BY created_at ASC LIMIT 1`,
    [ref],
  );
}
