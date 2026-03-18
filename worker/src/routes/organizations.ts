import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const orgs = new Hono<{ Bindings: Bindings }>();

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  customDomain: z.string().optional().nullable(),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "editor", "viewer"]).default("viewer"),
});

const updateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "editor", "viewer"]),
});

// List user's organizations
orgs.get("/", authMiddleware, async (c) => {
  const user = c.get("user");

  interface OrgRow {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    role: string;
    created_at: string;
  }

  const rows = await dbQuery<OrgRow>(
    c.env.DB,
    `SELECT o.id, o.name, o.slug, o.logo_url, o.primary_color, o.secondary_color, m.role, o.created_at
     FROM organizations o
     JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = ?
     ORDER BY o.created_at DESC`,
    [user.userId]
  );

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logo_url,
      primaryColor: r.primary_color,
      secondaryColor: r.secondary_color,
      role: r.role,
      createdAt: r.created_at,
    }))
  );
});

// Create organization
orgs.post("/", authMiddleware, zValidator("json", createOrgSchema), async (c) => {
  const user = c.get("user");
  const { name, slug } = c.req.valid("json");

  const existing = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM organizations WHERE slug = ?",
    [slug]
  );

  if (existing) {
    return c.json({ error: "Slug already in use" }, 409);
  }

  const orgId = generateId();
  const memberId = generateId();
  const now = new Date().toISOString();

  await dbRun(
    c.env.DB,
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [orgId, name, slug, now, now]
  );

  await dbRun(
    c.env.DB,
    "INSERT INTO org_members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [memberId, orgId, user.userId, now]
  );

  return c.json(
    {
      id: orgId,
      name,
      slug,
      role: "owner",
      createdAt: now,
    },
    201
  );
});

// Get organization
orgs.get("/:orgId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { orgId } = c.req.param();

  const member = await dbQueryFirst<{ role: string }>(
    c.env.DB,
    "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, user.userId]
  );

  if (!member && !user.isSuperAdmin) {
    return c.json({ error: "Not found" }, 404);
  }

  const org = await dbQueryFirst<{
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    custom_domain: string | null;
    created_at: string;
    updated_at: string;
  }>(c.env.DB, "SELECT * FROM organizations WHERE id = ?", [orgId]);

  if (!org) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logo_url,
    primaryColor: org.primary_color,
    secondaryColor: org.secondary_color,
    customDomain: org.custom_domain,
    role: member?.role,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  });
});

// Update organization
orgs.put(
  "/:orgId",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", updateOrgSchema),
  async (c) => {
    const { orgId } = c.req.param();
    const updates = c.req.valid("json");

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.logoUrl !== undefined) { sets.push("logo_url = ?"); params.push(updates.logoUrl); }
    if (updates.primaryColor !== undefined) { sets.push("primary_color = ?"); params.push(updates.primaryColor); }
    if (updates.secondaryColor !== undefined) { sets.push("secondary_color = ?"); params.push(updates.secondaryColor); }
    if (updates.customDomain !== undefined) { sets.push("custom_domain = ?"); params.push(updates.customDomain); }

    params.push(orgId);

    await dbRun(
      c.env.DB,
      `UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    const org = await dbQueryFirst<{
      id: string; name: string; slug: string;
      logo_url: string | null; primary_color: string; secondary_color: string;
      custom_domain: string | null; updated_at: string;
    }>(c.env.DB, "SELECT * FROM organizations WHERE id = ?", [orgId]);

    return c.json({
      id: org!.id,
      name: org!.name,
      slug: org!.slug,
      logoUrl: org!.logo_url,
      primaryColor: org!.primary_color,
      secondaryColor: org!.secondary_color,
      customDomain: org!.custom_domain,
      updatedAt: org!.updated_at,
    });
  }
);

// Delete organization (owner only)
orgs.delete("/:orgId", authMiddleware, requireRole("owner"), async (c) => {
  const { orgId } = c.req.param();

  await dbRun(c.env.DB, "DELETE FROM organizations WHERE id = ?", [orgId]);

  return c.json({ message: "Organization deleted" });
});

// List members
orgs.get("/:orgId/members", authMiddleware, requireRole("viewer"), async (c) => {
  const { orgId } = c.req.param();

  interface MemberRow {
    user_id: string;
    email: string;
    name: string;
    role: string;
    created_at: string;
  }

  const members = await dbQuery<MemberRow>(
    c.env.DB,
    `SELECT m.user_id, u.email, u.name, m.role, m.created_at
     FROM org_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = ?
     ORDER BY m.created_at ASC`,
    [orgId]
  );

  return c.json(
    members.map((m) => ({
      userId: m.user_id,
      email: m.email,
      name: m.name,
      role: m.role,
      joinedAt: m.created_at,
    }))
  );
});

// Add/invite member
orgs.post(
  "/:orgId/members",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", addMemberSchema),
  async (c) => {
    const { orgId } = c.req.param();
    const { email, role } = c.req.valid("json");

    const targetUser = await dbQueryFirst<{ id: string; name: string; email: string }>(
      c.env.DB,
      "SELECT id, name, email FROM users WHERE email = ?",
      [email.toLowerCase()]
    );

    if (!targetUser) {
      return c.json({ error: "User not found. They must register first." }, 404);
    }

    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM org_members WHERE org_id = ? AND user_id = ?",
      [orgId, targetUser.id]
    );

    if (existing) {
      return c.json({ error: "User is already a member" }, 409);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      "INSERT INTO org_members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, orgId, targetUser.id, role, now]
    );

    return c.json(
      {
        userId: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role,
        joinedAt: now,
      },
      201
    );
  }
);

// Update member role
orgs.put(
  "/:orgId/members/:userId",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", updateMemberSchema),
  async (c) => {
    const { orgId, userId } = c.req.param();
    const { role } = c.req.valid("json");
    const currentUser = c.get("user");

    if (userId === currentUser.userId) {
      return c.json({ error: "Cannot change your own role" }, 400);
    }

    // Prevent demoting another owner unless you are owner
    const orgRole = c.get("orgRole");
    if (orgRole !== "owner") {
      const targetMember = await dbQueryFirst<{ role: string }>(
        c.env.DB,
        "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
        [orgId, userId]
      );
      if (targetMember?.role === "owner") {
        return c.json({ error: "Only owners can modify other owners" }, 403);
      }
    }

    await dbRun(
      c.env.DB,
      "UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?",
      [role, orgId, userId]
    );

    return c.json({ userId, role });
  }
);

// Remove member
orgs.delete(
  "/:orgId/members/:userId",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const { orgId, userId } = c.req.param();
    const currentUser = c.get("user");

    if (userId === currentUser.userId) {
      return c.json({ error: "Cannot remove yourself. Transfer ownership first." }, 400);
    }

    await dbRun(
      c.env.DB,
      "DELETE FROM org_members WHERE org_id = ? AND user_id = ?",
      [orgId, userId]
    );

    return c.json({ message: "Member removed" });
  }
);

export { orgs as orgRoutes };
