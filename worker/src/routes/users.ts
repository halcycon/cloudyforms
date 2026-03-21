import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { hashPassword, generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const users = new Hono<{ Bindings: Bindings }>();

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_super_admin: number;
  created_at: string;
  updated_at: string;
}

function serializeUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isSuperAdmin: row.is_super_admin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  isSuperAdmin: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(),
});

// List users (super admin only)
users.get("/", authMiddleware, async (c) => {
  const currentUser = c.get("user");

  if (!currentUser.isSuperAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = (page - 1) * limit;
  const search = c.req.query("search");

  let rows: UserRow[];
  let total: { cnt: number } | null;

  if (search) {
    const pattern = `%${search}%`;
    rows = await dbQuery<UserRow>(
      c.env.DB,
      "SELECT id, email, name, is_super_admin, created_at, updated_at FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [pattern, pattern, limit, offset]
    );
    total = await dbQueryFirst<{ cnt: number }>(
      c.env.DB,
      "SELECT COUNT(*) as cnt FROM users WHERE email LIKE ? OR name LIKE ?",
      [pattern, pattern]
    );
  } else {
    rows = await dbQuery<UserRow>(
      c.env.DB,
      "SELECT id, email, name, is_super_admin, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    total = await dbQueryFirst<{ cnt: number }>(
      c.env.DB,
      "SELECT COUNT(*) as cnt FROM users"
    );
  }

  return c.json({
    users: rows.map(serializeUser),
    total: total?.cnt ?? 0,
    page,
    limit,
  });
});

// Get user
users.get("/:userId", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  const { userId } = c.req.param();

  // Users can view their own profile; admins can view any
  if (userId !== currentUser.userId && !currentUser.isSuperAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const user = await dbQueryFirst<UserRow>(
    c.env.DB,
    "SELECT id, email, name, is_super_admin, created_at, updated_at FROM users WHERE id = ?",
    [userId]
  );

  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json(serializeUser(user));
});

// Update user
users.put(
  "/:userId",
  authMiddleware,
  zValidator("json", updateUserSchema),
  async (c) => {
    const currentUser = c.get("user");
    const { userId } = c.req.param();
    const updates = c.req.valid("json");

    // Users can update themselves; super admins can update anyone
    if (userId !== currentUser.userId && !currentUser.isSuperAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Only super admins can grant super admin
    if (updates.isSuperAdmin !== undefined && !currentUser.isSuperAdmin) {
      return c.json({ error: "Only super admins can modify super admin status" }, 403);
    }

    if (updates.email) {
      const existing = await dbQueryFirst<{ id: string }>(
        c.env.DB,
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [updates.email.toLowerCase(), userId]
      );
      if (existing) return c.json({ error: "Email already in use" }, 409);
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.email !== undefined) { sets.push("email = ?"); params.push(updates.email.toLowerCase()); }
    if (updates.isSuperAdmin !== undefined) { sets.push("is_super_admin = ?"); params.push(updates.isSuperAdmin ? 1 : 0); }
    if (updates.password !== undefined) {
      const hash = await hashPassword(updates.password);
      sets.push("password_hash = ?");
      params.push(hash);
    }

    params.push(userId);
    await dbRun(c.env.DB, `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await dbQueryFirst<UserRow>(
      c.env.DB,
      "SELECT id, email, name, is_super_admin, created_at, updated_at FROM users WHERE id = ?",
      [userId]
    );

    if (!updated) return c.json({ error: "User not found" }, 404);

    return c.json(serializeUser(updated));
  }
);

// Delete user (super admin only)
users.delete("/:userId", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  const { userId } = c.req.param();

  if (!currentUser.isSuperAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (userId === currentUser.userId) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  const user = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM users WHERE id = ?",
    [userId]
  );

  if (!user) return c.json({ error: "User not found" }, 404);

  await dbRun(c.env.DB, "DELETE FROM users WHERE id = ?", [userId]);

  return c.json({ message: "User deleted" });
});

// ── Platform Settings (super admin) ─────────────────────────────────────────

// Get platform settings
users.get("/admin/settings", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser.isSuperAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await dbQuery<{ key: string; value: string }>(
    c.env.DB,
    "SELECT key, value FROM platform_settings"
  );

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return c.json({
    signupsEnabled: settings["signups_enabled"] ?? true,
    allowedSignupDomains: settings["allowed_signup_domains"] ?? [],
    defaultTheme: settings["default_theme"] ?? null,
  });
});

const updateSettingsSchema = z.object({
  signupsEnabled: z.boolean().optional(),
  allowedSignupDomains: z.array(z.string()).optional(),
  defaultTheme: z.object({
    mode: z.enum(["light", "dark", "system"]),
    preset: z.enum(["default", "ocean", "sunset", "forest", "rose", "slate"]),
  }).optional().nullable(),
});

// Update platform settings
users.put(
  "/admin/settings",
  authMiddleware,
  zValidator("json", updateSettingsSchema),
  async (c) => {
    const currentUser = c.get("user");
    if (!currentUser.isSuperAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const updates = c.req.valid("json");
    const now = new Date().toISOString();

    if (updates.signupsEnabled !== undefined) {
      await dbRun(
        c.env.DB,
        `INSERT INTO platform_settings (key, value, updated_at) VALUES ('signups_enabled', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [String(updates.signupsEnabled), now]
      );
    }

    if (updates.allowedSignupDomains !== undefined) {
      await dbRun(
        c.env.DB,
        `INSERT INTO platform_settings (key, value, updated_at) VALUES ('allowed_signup_domains', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [JSON.stringify(updates.allowedSignupDomains), now]
      );
    }

    if (updates.defaultTheme !== undefined) {
      const themeValue = updates.defaultTheme ? JSON.stringify(updates.defaultTheme) : "null";
      await dbRun(
        c.env.DB,
        `INSERT INTO platform_settings (key, value, updated_at) VALUES ('default_theme', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [themeValue, now]
      );
    }

    return c.json({ message: "Settings updated" });
  }
);

export { users as userRoutes };
