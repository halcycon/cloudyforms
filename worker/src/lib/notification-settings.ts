import type { FormSettings } from "../routes/forms";
import { dbQuery, dbQueryFirst } from "./db";

type MemberRole = "owner" | "admin" | "editor" | "creator" | "viewer";

const ALL_ROLES: MemberRole[] = ["owner", "admin", "editor", "creator", "viewer"];

export function hasEmailNotificationTargets(settings: FormSettings): boolean {
  if (settings.notificationEmails.length > 0) return true;
  const n = settings.emailNotify;
  if (!n) return false;
  if (n.formCreator) return true;
  if (n.allMembers) return true;
  if (n.groupIds?.length) return true;
  if (n.roles && ALL_ROLES.some((r) => n.roles?.[r])) return true;
  return false;
}

export function effectiveNotifyByEmail(settings: FormSettings): boolean {
  if (settings.notifyByEmail !== undefined) return settings.notifyByEmail;
  return hasEmailNotificationTargets(settings);
}

export async function resolveNotificationEmails(
  db: D1Database,
  settings: FormSettings,
  orgId: string,
  formCreatedBy?: string | null,
): Promise<string[]> {
  const emails = new Set<string>();

  for (const raw of settings.notificationEmails) {
    const email = raw.trim().toLowerCase();
    if (email) emails.add(email);
  }

  const notify = settings.emailNotify;
  if (!notify) return [...emails];

  if (notify.formCreator && formCreatedBy) {
    const creator = await dbQueryFirst<{ email: string }>(
      db,
      "SELECT email FROM users WHERE id = ?",
      [formCreatedBy],
    );
    if (creator?.email) emails.add(creator.email.toLowerCase());
  }

  const enabledRoles = ALL_ROLES.filter((r) => notify.roles?.[r]);
  if (notify.allMembers || enabledRoles.length > 0) {
    let query = `
      SELECT DISTINCT u.email
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      WHERE om.org_id = ? AND om.status = 'active'
    `;
    const params: string[] = [orgId];
    if (!notify.allMembers) {
      query += ` AND om.role IN (${enabledRoles.map(() => "?").join(", ")})`;
      params.push(...enabledRoles);
    }
    const rows = await dbQuery<{ email: string }>(db, query, params);
    for (const row of rows) emails.add(row.email.toLowerCase());
  }

  const groupIds = notify.groupIds ?? [];
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(", ");
    const rows = await dbQuery<{ email: string }>(
      db,
      `SELECT DISTINCT u.email
       FROM org_group_members gm
       JOIN users u ON u.id = gm.user_id
       JOIN org_groups g ON g.id = gm.group_id
       WHERE g.org_id = ? AND gm.group_id IN (${placeholders})`,
      [orgId, ...groupIds],
    );
    for (const row of rows) emails.add(row.email.toLowerCase());
  }

  return [...emails];
}

/** Strip secrets from settings returned to public form clients. */
export function sanitizePublicFormSettings(settings: FormSettings): FormSettings {
  const safe = { ...settings };
  delete safe.webhookSecret;
  if (safe.ntfy) {
    safe.ntfy = { ...safe.ntfy };
    delete safe.ntfy.authToken;
  }
  return safe;
}
