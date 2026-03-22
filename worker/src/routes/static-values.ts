import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const staticValues = new Hono<{ Bindings: Bindings }>();

const createSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  value: z.string().max(5000).default(""),
});

const updateSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(200).optional(),
  value: z.string().max(5000).optional(),
});

interface StaticValueRow {
  id: string;
  org_id: string;
  key: string;
  label: string;
  value: string;
  created_at: string;
  updated_at: string;
}

function serializeStaticValue(row: StaticValueRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    key: row.key,
    label: row.label,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// List static values for an org
staticValues.get(
  "/:orgId/static-values",
  authMiddleware,
  requireRole("viewer"),
  async (c) => {
    const { orgId } = c.req.param();

    const rows = await dbQuery<StaticValueRow>(
      c.env.DB,
      "SELECT * FROM org_static_values WHERE org_id = ? ORDER BY key ASC",
      [orgId]
    );

    return c.json(rows.map(serializeStaticValue));
  }
);

// Create a static value
staticValues.post(
  "/:orgId/static-values",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", createSchema),
  async (c) => {
    const { orgId } = c.req.param();
    const { key, label, value } = c.req.valid("json");

    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM org_static_values WHERE org_id = ? AND key = ?",
      [orgId, key]
    );

    if (existing) {
      return c.json({ error: "A static value with this key already exists" }, 409);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      "INSERT INTO org_static_values (id, org_id, key, label, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, orgId, key, label, value, now, now]
    );

    const row = await dbQueryFirst<StaticValueRow>(
      c.env.DB,
      "SELECT * FROM org_static_values WHERE id = ?",
      [id]
    );

    return c.json(serializeStaticValue(row!), 201);
  }
);

// Update a static value
staticValues.on(
  ["PUT", "PATCH"],
  "/:orgId/static-values/:valueId",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", updateSchema),
  async (c) => {
    const { orgId, valueId } = c.req.param();
    const updates = c.req.valid("json");

    const existing = await dbQueryFirst<StaticValueRow>(
      c.env.DB,
      "SELECT * FROM org_static_values WHERE id = ? AND org_id = ?",
      [valueId, orgId]
    );

    if (!existing) {
      return c.json({ error: "Static value not found" }, 404);
    }

    if (updates.key !== undefined && updates.key !== existing.key) {
      const dup = await dbQueryFirst<{ id: string }>(
        c.env.DB,
        "SELECT id FROM org_static_values WHERE org_id = ? AND key = ? AND id != ?",
        [orgId, updates.key, valueId]
      );
      if (dup) {
        return c.json({ error: "A static value with this key already exists" }, 409);
      }
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.key !== undefined) { sets.push("key = ?"); params.push(updates.key); }
    if (updates.label !== undefined) { sets.push("label = ?"); params.push(updates.label); }
    if (updates.value !== undefined) { sets.push("value = ?"); params.push(updates.value); }

    params.push(valueId);

    await dbRun(
      c.env.DB,
      `UPDATE org_static_values SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    const row = await dbQueryFirst<StaticValueRow>(
      c.env.DB,
      "SELECT * FROM org_static_values WHERE id = ?",
      [valueId]
    );

    return c.json(serializeStaticValue(row!));
  }
);

// Delete a static value
staticValues.delete(
  "/:orgId/static-values/:valueId",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const { orgId, valueId } = c.req.param();

    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM org_static_values WHERE id = ? AND org_id = ?",
      [valueId, orgId]
    );

    if (!existing) {
      return c.json({ error: "Static value not found" }, 404);
    }

    await dbRun(c.env.DB, "DELETE FROM org_static_values WHERE id = ?", [valueId]);

    return c.json({ message: "Static value deleted" });
  }
);

export { staticValues as staticValueRoutes };
