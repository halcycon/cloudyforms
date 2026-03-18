import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { verifyTurnstile } from "../lib/turnstile";
import { generateFingerprint } from "../lib/fingerprint";
import { sendEmail, buildFormReceiptEmail, buildNotificationEmail } from "../lib/email";
import type { Bindings } from "../index";
import type { FormSettings } from "./forms";

const responses = new Hono<{ Bindings: Bindings }>();

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  status: string;
  settings: string;
  fields: string;
  access_type: string;
  access_code: string | null;
}

interface ResponseRow {
  id: string;
  form_id: string;
  data: string;
  metadata: string;
  submitter_email: string | null;
  fingerprint: string | null;
  is_spam: number;
  created_at: string;
}

function serializeResponse(row: ResponseRow) {
  return {
    id: row.id,
    formId: row.form_id,
    data: JSON.parse(row.data),
    metadata: JSON.parse(row.metadata),
    submitterEmail: row.submitter_email,
    fingerprint: row.fingerprint,
    isSpam: row.is_spam === 1,
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

async function triggerWebhook(
  formId: string,
  event: string,
  payload: unknown,
  env: Bindings
): Promise<void> {
  const webhooks = await dbQuery<{
    url: string;
    secret: string | null;
  }>(
    env.DB,
    "SELECT url, secret FROM webhooks WHERE form_id = ? AND is_active = 1",
    [formId]
  );

  const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });

  for (const wh of webhooks) {
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

    // fire and forget
    fetch(wh.url, { method: "POST", headers, body }).catch(() => {});
  }
}

// ── Submit response (public) ────────────────────────────────────────────────────

const submitSchema = z.object({
  data: z.record(z.unknown()),
  turnstileToken: z.string().optional(),
  accessCode: z.string().optional(),
});

responses.post("/submit/:formSlug", zValidator("json", submitSchema), async (c) => {
  const { formSlug } = c.req.param();
  const { data, turnstileToken, accessCode } = c.req.valid("json");

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE slug = ?",
    [formSlug]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  if (form.status !== "published") {
    return c.json({ error: "This form is not accepting submissions" }, 403);
  }

  // Check access code
  if (form.access_type === "code") {
    if (!accessCode || accessCode !== form.access_code) {
      return c.json({ error: "Invalid access code" }, 403);
    }
  }

  const settings: FormSettings = JSON.parse(form.settings);

  // Check expiry
  if (settings.expiresAt && new Date(settings.expiresAt) < new Date()) {
    return c.json({ error: "This form has expired" }, 403);
  }

  // Check max responses
  if (settings.maxResponses) {
    const count = await dbQueryFirst<{ cnt: number }>(
      c.env.DB,
      "SELECT COUNT(*) as cnt FROM form_responses WHERE form_id = ? AND is_spam = 0",
      [form.id]
    );
    if ((count?.cnt ?? 0) >= settings.maxResponses) {
      return c.json({ error: "This form has reached its maximum responses" }, 403);
    }
  }

  // Turnstile verification
  if (settings.enableTurnstile) {
    if (!turnstileToken) {
      return c.json({ error: "Turnstile token required" }, 400);
    }
    const ip = c.req.header("CF-Connecting-IP");
    const valid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
      return c.json({ error: "Turnstile verification failed" }, 400);
    }
  }

  const fingerprint = await generateFingerprint(c.req.raw);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const userAgent = c.req.header("User-Agent") ?? "";

  // Duplicate check (when multiple submissions disabled)
  if (!settings.allowMultipleSubmissions) {
    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM form_responses WHERE form_id = ? AND fingerprint = ?",
      [form.id, fingerprint]
    );
    if (existing) {
      return c.json({ error: "You have already submitted this form" }, 409);
    }
  }

  const id = generateId();
  const now = new Date().toISOString();
  const metadata = { submittedAt: now, ip, fingerprint, userAgent };

  // Extract submitter email if configured
  let submitterEmail: string | null = null;
  if (settings.receiptEmailField && data[settings.receiptEmailField]) {
    submitterEmail = String(data[settings.receiptEmailField]);
  }

  await dbRun(
    c.env.DB,
    `INSERT INTO form_responses (id, form_id, data, metadata, submitter_email, fingerprint, is_spam, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, form.id, JSON.stringify(data), JSON.stringify(metadata), submitterEmail, fingerprint, now]
  );

  const responsePayload = { id, formId: form.id, createdAt: now };

  // Post-submission side effects (fire and forget)
  const fields = JSON.parse(form.fields) as { id: string; label?: string }[];
  const fieldPairs = fields
    .filter((f) => data[f.id] !== undefined)
    .map((f) => ({ label: f.label ?? f.id, value: data[f.id] }));

  // Send receipt email
  if (settings.sendReceiptEmail && submitterEmail) {
    const { html, text } = buildFormReceiptEmail(form.title, id, fieldPairs);
    sendEmail(
      { to: submitterEmail, subject: `Receipt: ${form.title}`, html, text },
      c.env
    ).catch(() => {});
  }

  // Send notification emails
  if (settings.notificationEmails.length > 0) {
    const { html, text } = buildNotificationEmail(
      form.title,
      id,
      submitterEmail ?? "",
      fieldPairs
    );
    for (const email of settings.notificationEmails) {
      sendEmail(
        { to: email, subject: `New response: ${form.title}`, html, text },
        c.env
      ).catch(() => {});
    }
  }

  // Trigger webhooks
  triggerWebhook(form.id, "response.created", responsePayload, c.env).catch(() => {});

  // Build response message
  const message = settings.successMessage || "Thank you for your submission!";
  const redirectUrl = settings.redirectUrl;

  return c.json({ id, message, ...(redirectUrl ? { redirectUrl } : {}) }, 201);
});

// ── Authenticated response routes ──────────────────────────────────────────────

// List responses for a form
responses.get("/form/:formId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = (page - 1) * limit;

  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role) {
    return c.json({ error: "Access denied" }, 403);
  }

  const rows = await dbQuery<ResponseRow>(
    c.env.DB,
    "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [formId, limit, offset]
  );

  const total = await dbQueryFirst<{ cnt: number }>(
    c.env.DB,
    "SELECT COUNT(*) as cnt FROM form_responses WHERE form_id = ?",
    [formId]
  );

  return c.json({
    responses: rows.map(serializeResponse),
    total: total?.cnt ?? 0,
    page,
    limit,
  });
});

// List responses (generic, filter by formId or orgId)
responses.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const formId = c.req.query("formId");
  const orgId = c.req.query("orgId");

  if (!formId && !orgId) {
    return c.json({ error: "formId or orgId query parameter is required" }, 400);
  }

  if (formId) {
    const form = await dbQueryFirst<{ org_id: string }>(
      c.env.DB,
      "SELECT org_id FROM forms WHERE id = ?",
      [formId]
    );

    if (!form) return c.json({ error: "Form not found" }, 404);

    const role = user.isSuperAdmin
      ? "owner"
      : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

    if (!role) return c.json({ error: "Access denied" }, 403);

    const rows = await dbQuery<ResponseRow>(
      c.env.DB,
      "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at DESC",
      [formId]
    );

    return c.json(rows.map(serializeResponse));
  }

  // orgId path
  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, orgId!);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const rows = await dbQuery<ResponseRow>(
    c.env.DB,
    `SELECT r.* FROM form_responses r
     JOIN forms f ON f.id = r.form_id
     WHERE f.org_id = ?
     ORDER BY r.created_at DESC`,
    [orgId]
  );

  return c.json(rows.map(serializeResponse));
});

// Get single response
responses.get("/:responseId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  return c.json(serializeResponse(row));
});

// Update response (admin)
responses.put("/:responseId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  const body = await c.req.json<{
    data?: Record<string, unknown>;
    isSpam?: boolean;
    submitterEmail?: string;
  }>();

  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.data !== undefined) { sets.push("data = ?"); params.push(JSON.stringify(body.data)); }
  if (body.isSpam !== undefined) { sets.push("is_spam = ?"); params.push(body.isSpam ? 1 : 0); }
  if (body.submitterEmail !== undefined) { sets.push("submitter_email = ?"); params.push(body.submitterEmail); }

  if (sets.length === 0) {
    return c.json({ error: "No updates provided" }, 400);
  }

  params.push(responseId);
  await dbRun(c.env.DB, `UPDATE form_responses SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await dbQueryFirst<ResponseRow>(
    c.env.DB,
    "SELECT * FROM form_responses WHERE id = ?",
    [responseId]
  );

  return c.json(serializeResponse(updated!));
});

// Delete response
responses.delete("/:responseId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    `SELECT f.org_id FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(c.env.DB, "DELETE FROM form_responses WHERE id = ?", [responseId]);

  return c.json({ message: "Response deleted" });
});

// Bulk delete responses for a form
responses.post("/form/:formId/bulk-delete", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<{ org_id: string }>(
    c.env.DB,
    "SELECT org_id FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  const body = await c.req.json<{ ids?: string[] }>();

  if (body.ids && body.ids.length > 0) {
    const placeholders = body.ids.map(() => "?").join(",");
    await dbRun(
      c.env.DB,
      `DELETE FROM form_responses WHERE form_id = ? AND id IN (${placeholders})`,
      [formId, ...body.ids]
    );
    return c.json({ deleted: body.ids.length });
  }

  // Delete all if no ids specified
  const result = await dbRun(
    c.env.DB,
    "DELETE FROM form_responses WHERE form_id = ?",
    [formId]
  );

  return c.json({ deleted: result.meta?.changes ?? 0 });
});

export { responses as responseRoutes };
