import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const workflowRoutes = new Hono<{ Bindings: Bindings }>();

const stageSchema = z.object({
  name: z.string().min(1).max(200),
  stageOrder: z.number().int().min(1),
  allowedRoles: z.array(z.string()).default([]),
  allowedGroups: z.array(z.string()).default([]),
  allowedUsers: z.array(z.string()).default([]),
  notifyOnReady: z.boolean().default(false),
});

const setStagesSchema = z.object({
  stages: z.array(stageSchema),
});

// Get workflow stages for a form
workflowRoutes.get("/:formId/workflow", authMiddleware, async (c) => {
  const { formId } = c.req.param();
  const user = c.get("user");

  // Verify user has access to this form's org
  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const member = await dbQueryFirst<{ role: string }>(
    c.env.DB,
    "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
    [form.org_id, user.userId]
  );

  if (!member && !user.isSuperAdmin) {
    return c.json({ error: "Not authorized" }, 403);
  }

  interface StageRow {
    id: string;
    form_id: string;
    name: string;
    stage_order: number;
    allowed_roles: string;
    allowed_groups: string;
    allowed_users: string;
    notify_on_ready: number;
  }

  const stages = await dbQuery<StageRow>(
    c.env.DB,
    "SELECT * FROM form_workflow_stages WHERE form_id = ? ORDER BY stage_order ASC",
    [formId]
  );

  return c.json(
    stages.map((s) => ({
      id: s.id,
      formId: s.form_id,
      name: s.name,
      stageOrder: s.stage_order,
      allowedRoles: JSON.parse(s.allowed_roles || "[]"),
      allowedGroups: JSON.parse(s.allowed_groups || "[]"),
      allowedUsers: JSON.parse(s.allowed_users || "[]"),
      notifyOnReady: s.notify_on_ready === 1,
    }))
  );
});

// Set (replace) all workflow stages for a form
workflowRoutes.post(
  "/:formId/workflow",
  authMiddleware,
  zValidator("json", setStagesSchema),
  async (c) => {
    const { formId } = c.req.param();
    const user = c.get("user");
    const { stages } = c.req.valid("json");

    // Verify user has admin access to this form's org
    const form = await dbQueryFirst<{ org_id: string }>(
      c.env.DB,
      "SELECT org_id FROM forms WHERE id = ?",
      [formId]
    );

    if (!form) {
      return c.json({ error: "Form not found" }, 404);
    }

    const member = await dbQueryFirst<{ role: string }>(
      c.env.DB,
      "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
      [form.org_id, user.userId]
    );

    if (!member || !["owner", "admin"].includes(member.role)) {
      if (!user.isSuperAdmin) {
        return c.json({ error: "Insufficient permissions" }, 403);
      }
    }

    // Delete existing stages
    await dbRun(
      c.env.DB,
      "DELETE FROM form_workflow_stages WHERE form_id = ?",
      [formId]
    );

    const now = new Date().toISOString();
    const result = [];

    // Insert new stages
    for (const stage of stages) {
      const id = generateId();
      await dbRun(
        c.env.DB,
        `INSERT INTO form_workflow_stages (id, form_id, name, stage_order, allowed_roles, allowed_groups, allowed_users, notify_on_ready, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          formId,
          stage.name,
          stage.stageOrder,
          JSON.stringify(stage.allowedRoles),
          JSON.stringify(stage.allowedGroups),
          JSON.stringify(stage.allowedUsers),
          stage.notifyOnReady ? 1 : 0,
          now,
          now,
        ]
      );
      result.push({
        id,
        formId,
        name: stage.name,
        stageOrder: stage.stageOrder,
        allowedRoles: stage.allowedRoles,
        allowedGroups: stage.allowedGroups,
        allowedUsers: stage.allowedUsers,
        notifyOnReady: stage.notifyOnReady,
      });
    }

    return c.json(result, 201);
  }
);

// Delete all workflow stages for a form
workflowRoutes.delete("/:formId/workflow", authMiddleware, async (c) => {
  const { formId } = c.req.param();
  const user = c.get("user");

  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const member = await dbQueryFirst<{ role: string }>(
    c.env.DB,
    "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
    [form.org_id, user.userId]
  );

  if (!member || !["owner", "admin"].includes(member.role)) {
    if (!user.isSuperAdmin) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
  }

  await dbRun(
    c.env.DB,
    "DELETE FROM form_workflow_stages WHERE form_id = ?",
    [formId]
  );

  return c.json({ message: "Workflow stages deleted" });
});

export { workflowRoutes };
