import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const kiosk = new Hono<{ Bindings: Bindings }>();

interface KioskRow {
  id: string;
  org_id: string;
  name: string;
  token: string;
  form_ids: string;
  allow_multiple_responses: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function serializeKiosk(row: KioskRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    token: row.token,
    formIds: JSON.parse(row.form_ids),
    allowMultipleResponses: row.allow_multiple_responses === 1,
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

const createKioskSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(100),
  formIds: z.array(z.string()).default([]),
  allowMultipleResponses: z.boolean().default(true),
});

const updateKioskSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  formIds: z.array(z.string()).optional(),
  allowMultipleResponses: z.boolean().optional(),
});

const registerKioskSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(100),
});

// List kiosks for an org
kiosk.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  if (!orgId) {
    return c.json({ error: "orgId query parameter is required" }, 400);
  }

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, orgId);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const rows = await dbQuery<KioskRow>(
    c.env.DB,
    "SELECT * FROM kiosks WHERE org_id = ? ORDER BY created_at DESC",
    [orgId]
  );

  return c.json(rows.map(serializeKiosk));
});

// Create kiosk
kiosk.post(
  "/",
  authMiddleware,
  zValidator("json", createKioskSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const role = user.isSuperAdmin
      ? "owner"
      : await getUserOrgRole(c.env.DB, user.userId, body.orgId);

    if (!role || role === "viewer" || role === "editor") {
      return c.json({ error: "Access denied" }, 403);
    }

    const id = generateId();
    const token = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      `INSERT INTO kiosks (id, org_id, name, token, form_ids, allow_multiple_responses, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, body.orgId, body.name, token,
        JSON.stringify(body.formIds), body.allowMultipleResponses ? 1 : 0,
        user.userId, now, now,
      ]
    );

    const row = await dbQueryFirst<KioskRow>(
      c.env.DB,
      "SELECT * FROM kiosks WHERE id = ?",
      [id]
    );

    return c.json(serializeKiosk(row!), 201);
  }
);

// Get kiosk by token (public, for kiosk landing page)
kiosk.get("/token/:token", async (c) => {
  const { token } = c.req.param();

  const row = await dbQueryFirst<KioskRow>(
    c.env.DB,
    "SELECT * FROM kiosks WHERE token = ?",
    [token]
  );

  if (!row) return c.json({ error: "Kiosk not found" }, 404);

  const formIds: string[] = JSON.parse(row.form_ids);

  // Fetch published forms for this kiosk
  const formDetails = await Promise.all(
    formIds.map((fid) =>
      dbQueryFirst<{ id: string; title: string; description: string | null; slug: string }>(
        c.env.DB,
        "SELECT id, title, description, slug FROM forms WHERE id = ? AND status = 'published'",
        [fid]
      )
    )
  );

  return c.json({
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    allowMultipleResponses: row.allow_multiple_responses === 1,
    forms: formDetails.filter(Boolean).map((f) => ({
      id: f!.id,
      title: f!.title,
      description: f!.description,
      slug: f!.slug,
    })),
  });
});

// Register current device as kiosk
kiosk.post(
  "/register",
  authMiddleware,
  zValidator("json", registerKioskSchema),
  async (c) => {
    const user = c.get("user");
    const { orgId, name } = c.req.valid("json");

    const role = user.isSuperAdmin
      ? "owner"
      : await getUserOrgRole(c.env.DB, user.userId, orgId);

    if (!role || role === "viewer" || role === "editor") {
      return c.json({ error: "Access denied" }, 403);
    }

    const id = generateId();
    const token = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      `INSERT INTO kiosks (id, org_id, name, token, form_ids, allow_multiple_responses, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', 1, ?, ?, ?)`,
      [id, orgId, name, token, user.userId, now, now]
    );

    return c.json({ id, token }, 201);
  }
);

// Get kiosk
kiosk.get("/:kioskId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { kioskId } = c.req.param();

  const row = await dbQueryFirst<KioskRow>(
    c.env.DB,
    "SELECT * FROM kiosks WHERE id = ?",
    [kioskId]
  );

  if (!row) return c.json({ error: "Kiosk not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  return c.json(serializeKiosk(row));
});

// Update kiosk
kiosk.on(["PUT", "PATCH"],
  "/:kioskId",
  authMiddleware,
  zValidator("json", updateKioskSchema),
  async (c) => {
    const user = c.get("user");
    const { kioskId } = c.req.param();
    const updates = c.req.valid("json");

    const row = await dbQueryFirst<KioskRow>(
      c.env.DB,
      "SELECT * FROM kiosks WHERE id = ?",
      [kioskId]
    );

    if (!row) return c.json({ error: "Kiosk not found" }, 404);

    const role = user.isSuperAdmin
      ? "owner"
      : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

    if (!role || role === "viewer" || role === "editor") {
      return c.json({ error: "Access denied" }, 403);
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.formIds !== undefined) { sets.push("form_ids = ?"); params.push(JSON.stringify(updates.formIds)); }
    if (updates.allowMultipleResponses !== undefined) {
      sets.push("allow_multiple_responses = ?");
      params.push(updates.allowMultipleResponses ? 1 : 0);
    }

    params.push(kioskId);
    await dbRun(c.env.DB, `UPDATE kiosks SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await dbQueryFirst<KioskRow>(
      c.env.DB,
      "SELECT * FROM kiosks WHERE id = ?",
      [kioskId]
    );

    return c.json(serializeKiosk(updated!));
  }
);

// Delete kiosk
kiosk.delete("/:kioskId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { kioskId } = c.req.param();

  const row = await dbQueryFirst<KioskRow>(
    c.env.DB,
    "SELECT org_id FROM kiosks WHERE id = ?",
    [kioskId]
  );

  if (!row) return c.json({ error: "Kiosk not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(c.env.DB, "DELETE FROM kiosks WHERE id = ?", [kioskId]);

  return c.json({ message: "Kiosk deleted" });
});

export { kiosk as kioskRoutes };
