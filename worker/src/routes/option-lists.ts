import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const optionLists = new Hono<{ Bindings: Bindings }>();

interface OptionListRow {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  options: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function serializeOptionList(row: OptionListRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    options: JSON.parse(row.options),
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

const optionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const createOptionListSchema = z.object({
  orgId: z.string().optional().nullable(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  options: z.array(optionSchema).default([]),
});

const updateOptionListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  options: z.array(optionSchema).optional(),
});

// List option lists (org-specific + global)
optionLists.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  let rows: OptionListRow[];

  if (user.isSuperAdmin) {
    rows = await dbQuery<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists ORDER BY created_at DESC"
    );
  } else if (orgId) {
    const role = await getUserOrgRole(c.env.DB, user.userId, orgId);
    if (!role) return c.json({ error: "Access denied" }, 403);

    rows = await dbQuery<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists WHERE org_id = ? OR org_id IS NULL ORDER BY created_at DESC",
      [orgId]
    );
  } else {
    // Return global option lists only
    rows = await dbQuery<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists WHERE org_id IS NULL ORDER BY created_at DESC"
    );
  }

  return c.json(rows.map(serializeOptionList));
});

// Create option list
optionLists.post(
  "/",
  authMiddleware,
  zValidator("json", createOptionListSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Only super admins can create global (orgId = null) option lists
    if (!body.orgId && !user.isSuperAdmin) {
      return c.json({ error: "Only super admins can create global option lists" }, 403);
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
      `INSERT INTO option_lists (id, org_id, name, description, options, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, body.orgId ?? null, body.name, body.description ?? null,
        JSON.stringify(body.options), user.userId, now, now,
      ]
    );

    const row = await dbQueryFirst<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists WHERE id = ?",
      [id]
    );

    return c.json(serializeOptionList(row!), 201);
  }
);

// Get option list
optionLists.get("/:listId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { listId } = c.req.param();

  const row = await dbQueryFirst<OptionListRow>(
    c.env.DB,
    "SELECT * FROM option_lists WHERE id = ?",
    [listId]
  );

  if (!row) return c.json({ error: "Option list not found" }, 404);

  // Global lists accessible to all authenticated users
  if (row.org_id && !user.isSuperAdmin) {
    const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
    if (!role) return c.json({ error: "Access denied" }, 403);
  }

  return c.json(serializeOptionList(row));
});

// Update option list
optionLists.put(
  "/:listId",
  authMiddleware,
  zValidator("json", updateOptionListSchema),
  async (c) => {
    const user = c.get("user");
    const { listId } = c.req.param();
    const updates = c.req.valid("json");

    const row = await dbQueryFirst<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists WHERE id = ?",
      [listId]
    );

    if (!row) return c.json({ error: "Option list not found" }, 404);

    if (!row.org_id && !user.isSuperAdmin) {
      return c.json({ error: "Only super admins can modify global option lists" }, 403);
    }

    if (row.org_id && !user.isSuperAdmin) {
      const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
      if (!role || role === "viewer") return c.json({ error: "Access denied" }, 403);
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
    if (updates.options !== undefined) { sets.push("options = ?"); params.push(JSON.stringify(updates.options)); }

    params.push(listId);
    await dbRun(c.env.DB, `UPDATE option_lists SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await dbQueryFirst<OptionListRow>(
      c.env.DB,
      "SELECT * FROM option_lists WHERE id = ?",
      [listId]
    );

    return c.json(serializeOptionList(updated!));
  }
);

// Delete option list
optionLists.delete("/:listId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { listId } = c.req.param();

  const row = await dbQueryFirst<OptionListRow>(
    c.env.DB,
    "SELECT org_id FROM option_lists WHERE id = ?",
    [listId]
  );

  if (!row) return c.json({ error: "Option list not found" }, 404);

  if (!row.org_id && !user.isSuperAdmin) {
    return c.json({ error: "Only super admins can delete global option lists" }, 403);
  }

  if (row.org_id && !user.isSuperAdmin) {
    const role = await getUserOrgRole(c.env.DB, user.userId, row.org_id);
    if (!role || role === "viewer" || role === "editor") {
      return c.json({ error: "Access denied" }, 403);
    }
  }

  await dbRun(c.env.DB, "DELETE FROM option_lists WHERE id = ?", [listId]);

  return c.json({ message: "Option list deleted" });
});

export { optionLists as optionListRoutes };
