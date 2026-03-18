import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const webhooks = new Hono<{ Bindings: Bindings }>();

interface WebhookRow {
  id: string;
  form_id: string;
  url: string;
  secret: string | null;
  events: string;
  is_active: number;
  created_at: string;
}

function serializeWebhook(row: WebhookRow) {
  return {
    id: row.id,
    formId: row.form_id,
    url: row.url,
    secret: row.secret ? "***" : null,
    events: JSON.parse(row.events),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
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

const createWebhookSchema = z.object({
  formId: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).default(["response.created"]),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().optional().nullable(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// List webhooks for a form
webhooks.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const formId = c.req.query("formId");

  if (!formId) {
    return c.json({ error: "formId query parameter is required" }, 400);
  }

  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer") return c.json({ error: "Access denied" }, 403);

  const rows = await dbQuery<WebhookRow>(
    c.env.DB,
    "SELECT * FROM webhooks WHERE form_id = ? ORDER BY created_at DESC",
    [formId]
  );

  return c.json(rows.map(serializeWebhook));
});

// Create webhook
webhooks.post("/", authMiddleware, zValidator("json", createWebhookSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [body.formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  const id = generateId();
  const now = new Date().toISOString();

  await dbRun(
    c.env.DB,
    "INSERT INTO webhooks (id, form_id, url, secret, events, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    [id, body.formId, body.url, body.secret ?? null, JSON.stringify(body.events), now]
  );

  const row = await dbQueryFirst<WebhookRow>(
    c.env.DB,
    "SELECT * FROM webhooks WHERE id = ?",
    [id]
  );

  return c.json(serializeWebhook(row!), 201);
});

// Update webhook
webhooks.put("/:webhookId", authMiddleware, zValidator("json", updateWebhookSchema), async (c) => {
  const user = c.get("user");
  const { webhookId } = c.req.param();
  const updates = c.req.valid("json");

  const row = await dbQueryFirst<WebhookRow & { org_id: string }>(
    c.env.DB,
    `SELECT w.*, f.org_id FROM webhooks w JOIN forms f ON f.id = w.form_id WHERE w.id = ?`,
    [webhookId]
  );

  if (!row) return c.json({ error: "Webhook not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.url !== undefined) { sets.push("url = ?"); params.push(updates.url); }
  if (updates.secret !== undefined) { sets.push("secret = ?"); params.push(updates.secret); }
  if (updates.events !== undefined) { sets.push("events = ?"); params.push(JSON.stringify(updates.events)); }
  if (updates.isActive !== undefined) { sets.push("is_active = ?"); params.push(updates.isActive ? 1 : 0); }

  if (sets.length === 0) return c.json({ error: "No updates provided" }, 400);

  params.push(webhookId);
  await dbRun(c.env.DB, `UPDATE webhooks SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await dbQueryFirst<WebhookRow>(
    c.env.DB,
    "SELECT * FROM webhooks WHERE id = ?",
    [webhookId]
  );

  return c.json(serializeWebhook(updated!));
});

// Delete webhook
webhooks.delete("/:webhookId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { webhookId } = c.req.param();

  const row = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    `SELECT f.org_id FROM webhooks w JOIN forms f ON f.id = w.form_id WHERE w.id = ?`,
    [webhookId]
  );

  if (!row) return c.json({ error: "Webhook not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(c.env.DB, "DELETE FROM webhooks WHERE id = ?", [webhookId]);

  return c.json({ message: "Webhook deleted" });
});

// Manually trigger webhook for a form
webhooks.post("/trigger/:formId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<{ org_id: string; title: string }>(
    c.env.DB,
    "SELECT org_id, title FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer") return c.json({ error: "Access denied" }, 403);

  const activeWebhooks = await dbQuery<{ id: string; url: string; secret: string | null }>(
    c.env.DB,
    "SELECT id, url, secret FROM webhooks WHERE form_id = ? AND is_active = 1",
    [formId]
  );

  if (activeWebhooks.length === 0) {
    return c.json({ message: "No active webhooks found", triggered: 0 });
  }

  const payload = {
    event: "webhook.test",
    data: { formId, formTitle: form.title, triggeredBy: user.userId },
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    activeWebhooks.map(async (wh) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (wh.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(wh.secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        const sigHex = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        headers["X-CloudyForms-Signature"] = `sha256=${sigHex}`;
      }

      const res = await fetch(wh.url, { method: "POST", headers, body });
      return { id: wh.id, url: wh.url, status: res.status, ok: res.ok };
    })
  );

  const triggered = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ id: string; url: string; status: number; ok: boolean }>).value);

  return c.json({ triggered: triggered.length, results: triggered });
});

export { webhooks as webhookRoutes };
