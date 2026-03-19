import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const fieldGroups = new Hono<{ Bindings: Bindings }>();

interface FieldGroupRow {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  fields: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function serializeFieldGroup(row: FieldGroupRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    fields: JSON.parse(row.fields),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserOrgRole(
  db: D1Database,
  userId: string,
  orgId: string
): Promise<string | null> {
  const m = await dbQueryFirst<{ role: string }>(
    db,
    "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  );
  return m?.role ?? null;
}

const createFieldGroupSchema = z.object({
  orgId: z.string().optional().nullable(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  fields: z.array(z.any()).default([]),
});

const updateFieldGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  fields: z.array(z.any()).optional(),
});

// List field groups (org-specific + global)
fieldGroups.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  let rows: FieldGroupRow[];

  if (user.isSuperAdmin) {
    rows = await dbQuery<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups ORDER BY created_at DESC"
    );
  } else if (orgId) {
    const role = await getUserOrgRole(c.env.DB, user.userId, orgId);
    if (!role) return c.json({ error: "Access denied" }, 403);

    rows = await dbQuery<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups WHERE org_id = ? OR org_id IS NULL ORDER BY created_at DESC",
      [orgId]
    );
  } else {
    // Return global field groups only
    rows = await dbQuery<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups WHERE org_id IS NULL ORDER BY created_at DESC"
    );
  }

  return c.json(rows.map(serializeFieldGroup));
});

// Create field group
fieldGroups.post(
  "/",
  authMiddleware,
  zValidator("json", createFieldGroupSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Only super admins can create global (orgId = null) field groups
    if (!body.orgId && !user.isSuperAdmin) {
      return c.json({ error: "Only super admins can create global field groups" }, 403);
    }

    if (body.orgId) {
      const role = user.isSuperAdmin
        ? "owner"
        : await getUserOrgRole(c.env.DB, user.userId, body.orgId);
      if (!role || role === "viewer") {
        return c.json({ error: "Access denied" }, 403);
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      `INSERT INTO field_groups (id, org_id, name, description, fields, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, body.orgId ?? null, body.name, body.description ?? null,
        JSON.stringify(body.fields), user.userId, now, now,
      ]
    );

    const row = await dbQueryFirst<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups WHERE id = ?",
      [id]
    );

    return c.json(serializeFieldGroup(row!), 201);
  }
);

// Get field group
fieldGroups.get("/:groupId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { groupId } = c.req.param();

  const row = await dbQueryFirst<FieldGroupRow>(
    c.env.DB,
    "SELECT * FROM field_groups WHERE id = ?",
    [groupId]
  );

  if (!row) return c.json({ error: "Field group not found" }, 404);

  // Global groups accessible to all authenticated users
  if (row.org_id && !user.isSuperAdmin) {
    const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
    if (!role) return c.json({ error: "Access denied" }, 403);
  }

  return c.json(serializeFieldGroup(row));
});

// Update field group
fieldGroups.on(["PUT", "PATCH"],
  "/:groupId",
  authMiddleware,
  zValidator("json", updateFieldGroupSchema),
  async (c) => {
    const user = c.get("user");
    const { groupId } = c.req.param();
    const updates = c.req.valid("json");

    const row = await dbQueryFirst<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups WHERE id = ?",
      [groupId]
    );

    if (!row) return c.json({ error: "Field group not found" }, 404);

    if (!row.org_id && !user.isSuperAdmin) {
      return c.json({ error: "Only super admins can modify global field groups" }, 403);
    }

    if (row.org_id && !user.isSuperAdmin) {
      const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
      if (!role || role === "viewer") return c.json({ error: "Access denied" }, 403);
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
    if (updates.fields !== undefined) { sets.push("fields = ?"); params.push(JSON.stringify(updates.fields)); }

    params.push(groupId);
    await dbRun(c.env.DB, `UPDATE field_groups SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await dbQueryFirst<FieldGroupRow>(
      c.env.DB,
      "SELECT * FROM field_groups WHERE id = ?",
      [groupId]
    );

    return c.json(serializeFieldGroup(updated!));
  }
);

// Delete field group
fieldGroups.delete("/:groupId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { groupId } = c.req.param();

  const row = await dbQueryFirst<FieldGroupRow>(
    c.env.DB,
    "SELECT org_id FROM field_groups WHERE id = ?",
    [groupId]
  );

  if (!row) return c.json({ error: "Field group not found" }, 404);

  if (!row.org_id && !user.isSuperAdmin) {
    return c.json({ error: "Only super admins can delete global field groups" }, 403);
  }

  if (row.org_id && !user.isSuperAdmin) {
    const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
    if (!role || role === "viewer" || role === "editor") {
      return c.json({ error: "Access denied" }, 403);
    }
  }

  await dbRun(c.env.DB, "DELETE FROM field_groups WHERE id = ?", [groupId]);

  return c.json({ message: "Field group deleted" });
});

export { fieldGroups as fieldGroupRoutes };
