import { generateId } from "./auth";
import { sendOrgEmail, renderOrgInviteEmail, getOrgEmailBranding } from "./email";
import { dbQuery, dbQueryFirst, dbRun } from "./db";

const DEFAULT_PLATFORM_SITE = "https://forms.thecuckoocamp.co.uk";
const INVITE_TTL_DAYS = 7;

export async function getOrgSiteUrl(db: D1Database, orgId: string): Promise<string> {
  const primary = await dbQueryFirst<{ domain: string }>(
    db,
    `SELECT domain FROM custom_domains
     WHERE org_id = ? AND verified = 1
     ORDER BY is_primary DESC, created_at ASC
     LIMIT 1`,
    [orgId],
  );
  if (primary) return `https://${primary.domain}`;

  const org = await dbQueryFirst<{ custom_domain: string | null }>(
    db,
    "SELECT custom_domain FROM organizations WHERE id = ?",
    [orgId],
  );
  if (org?.custom_domain) return `https://${org.custom_domain}`;

  return DEFAULT_PLATFORM_SITE;
}

export async function isOrgMember(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const row = await dbQueryFirst<{ id: string }>(
    db,
    "SELECT id FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId],
  );
  return !!row;
}

export async function addOrgMember(
  db: D1Database,
  orgId: string,
  userId: string,
  role: string,
  status: "active" | "pending" = "active",
): Promise<void> {
  const id = generateId();
  const now = new Date().toISOString();
  await dbRun(
    db,
    "INSERT INTO org_members (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, orgId, userId, role, status, now],
  );
}

export async function acceptInvitationByToken(
  db: D1Database,
  token: string,
  userId: string,
  email: string,
): Promise<{ orgId: string; role: string } | null> {
  const invite = await dbQueryFirst<{
    id: string;
    org_id: string;
    email: string;
    role: string;
    accepted_at: string | null;
    expires_at: string;
  }>(
    db,
    "SELECT id, org_id, email, role, accepted_at, expires_at FROM org_invitations WHERE token = ?",
    [token],
  );

  if (!invite || invite.accepted_at) return null;
  if (invite.email.toLowerCase() !== email.toLowerCase()) return null;
  if (invite.expires_at < new Date().toISOString()) return null;

  if (!(await isOrgMember(db, invite.org_id, userId))) {
    await addOrgMember(db, invite.org_id, userId, invite.role, "active");
  }

  await dbRun(
    db,
    "UPDATE org_invitations SET accepted_at = ? WHERE id = ?",
    [new Date().toISOString(), invite.id],
  );

  return { orgId: invite.org_id, role: invite.role };
}

export async function acceptInvitationsForEmail(
  db: D1Database,
  userId: string,
  email: string,
  limitToOrgId?: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const invites = await dbQuery<{
    id: string;
    org_id: string;
    role: string;
  }>(
    db,
    `SELECT id, org_id, role FROM org_invitations
     WHERE email = ? AND accepted_at IS NULL AND expires_at > ?`,
    [email.toLowerCase(), now],
  );

  const joinedOrgIds: string[] = [];
  for (const invite of invites) {
    if (limitToOrgId && invite.org_id !== limitToOrgId) continue;
    if (await isOrgMember(db, invite.org_id, userId)) {
      await dbRun(db, "UPDATE org_invitations SET accepted_at = ? WHERE id = ?", [now, invite.id]);
      continue;
    }
    await addOrgMember(db, invite.org_id, userId, invite.role, "active");
    await dbRun(db, "UPDATE org_invitations SET accepted_at = ? WHERE id = ?", [now, invite.id]);
    joinedOrgIds.push(invite.org_id);
  }
  return joinedOrgIds;
}

export async function linkUserAfterRegistration(
  db: D1Database,
  userId: string,
  email: string,
  options: { domainOrgId?: string; inviteToken?: string },
): Promise<void> {
  const joined = new Set<string>();

  if (options.inviteToken) {
    const accepted = await acceptInvitationByToken(db, options.inviteToken, userId, email);
    if (accepted) joined.add(accepted.orgId);
  }

  for (const orgId of await acceptInvitationsForEmail(db, userId, email, options.domainOrgId)) {
    joined.add(orgId);
  }

  if (options.domainOrgId && !joined.has(options.domainOrgId)) {
    if (!(await isOrgMember(db, options.domainOrgId, userId))) {
      await addOrgMember(db, options.domainOrgId, userId, "viewer", "pending");
    }
  }
}

export async function createOrgInvitation(
  db: D1Database,
  env: import("../index").Bindings,
  params: {
    orgId: string;
    orgName: string;
    email: string;
    role: string;
    invitedByUserId: string;
    invitedByName: string;
  },
): Promise<{ id: string; email: string; role: string; expiresAt: string }> {
  const email = params.email.toLowerCase();
  const existingUser = await dbQueryFirst<{ id: string }>(
    db,
    "SELECT id FROM users WHERE email = ?",
    [email],
  );
  if (existingUser) {
    throw new Error("USER_EXISTS");
  }

  const existingInvite = await dbQueryFirst<{ id: string }>(
    db,
    "SELECT id FROM org_invitations WHERE org_id = ? AND email = ? AND accepted_at IS NULL",
    [params.orgId, email],
  );
  if (existingInvite) {
    throw new Error("INVITE_EXISTS");
  }

  const id = generateId();
  const token = generateId();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  const siteUrl = await getOrgSiteUrl(db, params.orgId);
  const registerUrl = `${siteUrl}/register?invite=${encodeURIComponent(token)}`;
  const branding = await getOrgEmailBranding(db, params.orgId);

  await dbRun(
    db,
    `INSERT INTO org_invitations (id, org_id, email, role, token, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, params.orgId, email, params.role, token, params.invitedByUserId, expiresAt],
  );

  const { html, text } = renderOrgInviteEmail(branding, {
    invitedByName: params.invitedByName,
    registerUrl,
    role: params.role,
    expiry: "7 days",
  });
  await sendOrgEmail(db, env, params.orgId, {
    to: email,
    subject: `You're invited to join ${params.orgName} on CloudyForms`,
    html,
    text,
    fromName: params.orgName,
  });

  return { id, email, role: params.role, expiresAt };
}

export async function getInvitationByToken(db: D1Database, token: string) {
  const invite = await dbQueryFirst<{
    email: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    org_name: string;
  }>(
    db,
    `SELECT i.email, i.role, i.expires_at, i.accepted_at, o.name AS org_name
     FROM org_invitations i
     JOIN organizations o ON o.id = i.org_id
     WHERE i.token = ?`,
    [token],
  );

  if (!invite || invite.accepted_at) return null;
  if (invite.expires_at < new Date().toISOString()) return null;

  return {
    email: invite.email,
    role: invite.role,
    orgName: invite.org_name,
  };
}
