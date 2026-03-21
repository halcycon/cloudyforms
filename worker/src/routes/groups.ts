import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const groups = new Hono<{ Bindings: Bindings }>();

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

const addGroupMemberSchema = z.object({
  userId: z.string().min(1),
});

// List groups for an organization
groups.get(
  "/:orgId/groups",
  authMiddleware,
  requireRole("viewer"),
  async (c) => {
    const { orgId } = c.req.param();

    interface GroupRow {
      id: string;
      org_id: string;
      name: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }

    const rows = await dbQuery<GroupRow>(
      c.env.DB,
      "SELECT * FROM org_groups WHERE org_id = ? ORDER BY name ASC",
      [orgId]
    );

    // For each group, also fetch member count
    const result = await Promise.all(
      rows.map(async (g) => {
        const countRow = await dbQueryFirst<{ cnt: number }>(
          c.env.DB,
          "SELECT COUNT(*) as cnt FROM org_group_members WHERE group_id = ?",
          [g.id]
        );
        return {
          id: g.id,
          orgId: g.org_id,
          name: g.name,
          description: g.description,
          memberCount: countRow?.cnt ?? 0,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
        };
      })
    );

    return c.json(result);
  }
);

// Create group
groups.post(
  "/:orgId/groups",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", createGroupSchema),
  async (c) => {
    const { orgId } = c.req.param();
    const { name, description } = c.req.valid("json");

    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM org_groups WHERE org_id = ? AND name = ?",
      [orgId, name]
    );

    if (existing) {
      return c.json({ error: "A group with this name already exists" }, 409);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      "INSERT INTO org_groups (id, org_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, orgId, name, description ?? null, now, now]
    );

    return c.json(
      {
        id,
        orgId,
        name,
        description: description ?? null,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      201
    );
  }
);

// Update group
groups.on(
  ["PUT", "PATCH"],
  "/:orgId/groups/:groupId",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", updateGroupSchema),
  async (c) => {
    const { orgId, groupId } = c.req.param();
    const updates = c.req.valid("json");

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) {
      // Check uniqueness
      const existing = await dbQueryFirst<{ id: string }>(
        c.env.DB,
        "SELECT id FROM org_groups WHERE org_id = ? AND name = ? AND id != ?",
        [orgId, updates.name, groupId]
      );
      if (existing) {
        return c.json({ error: "A group with this name already exists" }, 409);
      }
      sets.push("name = ?");
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push("description = ?");
      params.push(updates.description);
    }

    params.push(groupId);
    params.push(orgId);

    await dbRun(
      c.env.DB,
      `UPDATE org_groups SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`,
      params
    );

    const group = await dbQueryFirst<{
      id: string;
      org_id: string;
      name: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>(c.env.DB, "SELECT * FROM org_groups WHERE id = ?", [groupId]);

    if (!group) {
      return c.json({ error: "Group not found" }, 404);
    }

    return c.json({
      id: group.id,
      orgId: group.org_id,
      name: group.name,
      description: group.description,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    });
  }
);

// Delete group
groups.delete(
  "/:orgId/groups/:groupId",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const { orgId, groupId } = c.req.param();

    await dbRun(
      c.env.DB,
      "DELETE FROM org_groups WHERE id = ? AND org_id = ?",
      [groupId, orgId]
    );

    return c.json({ message: "Group deleted" });
  }
);

// List group members
groups.get(
  "/:orgId/groups/:groupId/members",
  authMiddleware,
  requireRole("viewer"),
  async (c) => {
    const { groupId } = c.req.param();

    interface MemberRow {
      user_id: string;
      email: string;
      name: string;
      is_super_admin: number;
      user_created_at: string;
      joined_at: string;
    }

    const members = await dbQuery<MemberRow>(
      c.env.DB,
      `SELECT gm.user_id, u.email, u.name, u.is_super_admin, u.created_at AS user_created_at, gm.created_at AS joined_at
       FROM org_group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.created_at ASC`,
      [groupId]
    );

    return c.json(
      members.map((m) => ({
        userId: m.user_id,
        user: {
          id: m.user_id,
          email: m.email,
          name: m.name,
          isSuperAdmin: m.is_super_admin === 1,
          createdAt: m.user_created_at,
        },
        joinedAt: m.joined_at,
      }))
    );
  }
);

// Add member to group
groups.post(
  "/:orgId/groups/:groupId/members",
  authMiddleware,
  requireRole("admin"),
  zValidator("json", addGroupMemberSchema),
  async (c) => {
    const { orgId, groupId } = c.req.param();
    const { userId } = c.req.valid("json");

    // Verify user is a member of the organization
    const orgMember = await dbQueryFirst<{ user_id: string }>(
      c.env.DB,
      "SELECT user_id FROM org_members WHERE org_id = ? AND user_id = ?",
      [orgId, userId]
    );

    if (!orgMember) {
      return c.json(
        { error: "User must be a member of the organization first" },
        400
      );
    }

    // Check if already in group
    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM org_group_members WHERE group_id = ? AND user_id = ?",
      [groupId, userId]
    );

    if (existing) {
      return c.json({ error: "User is already in this group" }, 409);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await dbRun(
      c.env.DB,
      "INSERT INTO org_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)",
      [id, groupId, userId, now]
    );

    // Fetch user info for response
    const user = await dbQueryFirst<{
      id: string;
      email: string;
      name: string;
      is_super_admin: number;
      created_at: string;
    }>(c.env.DB, "SELECT id, email, name, is_super_admin, created_at FROM users WHERE id = ?", [
      userId,
    ]);

    return c.json(
      {
        userId,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              isSuperAdmin: user.is_super_admin === 1,
              createdAt: user.created_at,
            }
          : null,
        joinedAt: now,
      },
      201
    );
  }
);

// Remove member from group
groups.delete(
  "/:orgId/groups/:groupId/members/:userId",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const { groupId, userId } = c.req.param();

    await dbRun(
      c.env.DB,
      "DELETE FROM org_group_members WHERE group_id = ? AND user_id = ?",
      [groupId, userId]
    );

    return c.json({ message: "Member removed from group" });
  }
);

export { groups as groupRoutes };
