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
import { resolveOptionListReferences, serializeForm, type FormRow as FullFormRow } from "./forms";

const responses = new Hono<{ Bindings: Bindings }>();

/** Return the ID of the first workflow stage for a form, or null if none. */
async function getFirstWorkflowStageId(db: D1Database, formId: string): Promise<string | null> {
  const row = await dbQueryFirst<{ id: string }>(
    db,
    "SELECT id FROM form_workflow_stages WHERE form_id = ? ORDER BY stage_order ASC LIMIT 1",
    [formId]
  );
  return row?.id ?? null;
}

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
  status: string;
  draft_token: string | null;
  current_stage: string | null;
  updated_by: string | null;
  updated_at: string | null;
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
    status: row.status ?? "submitted",
    draftToken: row.draft_token,
    currentStage: row.current_stage,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
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
  console.log(`[RESPONSES] Submission attempt slug=${formSlug}`);

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE slug = ?",
    [formSlug]
  );

  if (!form) {
    console.log(`[RESPONSES] Form not found slug=${formSlug}`);
    return c.json({ error: "Form not found" }, 404);
  }

  if (form.status !== "published") {
    console.log(`[RESPONSES] Form not published slug=${formSlug} status=${form.status}`);
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

  // If the form has workflow stages, start at the first stage
  const firstStageId = await getFirstWorkflowStageId(c.env.DB, form.id);

  await dbRun(
    c.env.DB,
    `INSERT INTO form_responses (id, form_id, data, metadata, submitter_email, fingerprint, is_spam, status, current_stage, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'submitted', ?, ?)`,
    [id, form.id, JSON.stringify(data), JSON.stringify(metadata), submitterEmail, fingerprint, firstStageId, now]
  );

  const responsePayload = { id, formId: form.id, createdAt: now };
  console.log(`[RESPONSES] Submission saved id=${id} formId=${form.id} slug=${formSlug} stage=${firstStageId ?? 'none'}`);

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

// ── My Tasks – responses awaiting the current user's action ─────────────────

interface StageRow {
  id: string;
  form_id: string;
  name: string;
  stage_order: number;
  allowed_roles: string;
  allowed_groups: string;
  allowed_users: string;
}

/** Check if a user can act on a workflow stage based on role, group, or direct assignment. */
function canUserActOnStage(
  userId: string,
  isSuperAdmin: boolean,
  userRole: string | null,
  userGroupIds: Set<string>,
  allowedRoles: string[],
  allowedGroups: string[],
  allowedUsers: string[],
): boolean {
  if (isSuperAdmin) return true;
  if (allowedUsers.includes(userId)) return true;
  if (userRole && allowedRoles.includes(userRole)) return true;
  if (allowedGroups.some((gId) => userGroupIds.has(gId))) return true;
  return false;
}

responses.get("/my-tasks", authMiddleware, async (c) => {
  const user = c.get("user");

  // 1. Get user's org memberships (org_id → role)
  const memberships = await dbQuery<{ org_id: string; role: string }>(
    c.env.DB,
    "SELECT org_id, role FROM org_members WHERE user_id = ?",
    [user.userId]
  );

  if (memberships.length === 0 && !user.isSuperAdmin) {
    return c.json({ tasks: [] });
  }

  // 2. Get user's group memberships
  const groupRows = await dbQuery<{ group_id: string }>(
    c.env.DB,
    "SELECT group_id FROM org_group_members WHERE user_id = ?",
    [user.userId]
  );
  const userGroupIds = new Set(groupRows.map((g) => g.group_id));

  // 3. Build a map of orgId → role for quick lookups
  const orgRoleMap = new Map<string, string>();
  for (const m of memberships) {
    orgRoleMap.set(m.org_id, m.role);
  }

  // 4. Get all submitted (not draft/completed) responses that have a current_stage,
  //    together with their form info and stage info
  const orgIds = memberships.map((m) => m.org_id);

  // For super admins without memberships, get all responses in workflow
  let taskRows: Array<
    ResponseRow & {
      form_title: string;
      form_slug: string;
      org_id: string;
      stage_name: string;
      stage_order: number;
      allowed_roles: string;
      allowed_groups: string;
      allowed_users: string;
      total_stages: number;
    }
  >;

  if (user.isSuperAdmin && orgIds.length === 0) {
    taskRows = await dbQuery(
      c.env.DB,
      `SELECT r.*, f.title AS form_title, f.slug AS form_slug, f.org_id,
              s.name AS stage_name, s.stage_order, s.allowed_roles, s.allowed_groups, s.allowed_users,
              (SELECT COUNT(*) FROM form_workflow_stages WHERE form_id = f.id) AS total_stages
       FROM form_responses r
       JOIN forms f ON f.id = r.form_id
       JOIN form_workflow_stages s ON s.id = r.current_stage
       WHERE r.status = 'submitted' AND r.current_stage IS NOT NULL
       ORDER BY r.created_at DESC`
    );
  } else {
    const placeholders = orgIds.map(() => "?").join(",");
    taskRows = await dbQuery(
      c.env.DB,
      `SELECT r.*, f.title AS form_title, f.slug AS form_slug, f.org_id,
              s.name AS stage_name, s.stage_order, s.allowed_roles, s.allowed_groups, s.allowed_users,
              (SELECT COUNT(*) FROM form_workflow_stages WHERE form_id = f.id) AS total_stages
       FROM form_responses r
       JOIN forms f ON f.id = r.form_id
       JOIN form_workflow_stages s ON s.id = r.current_stage
       WHERE r.status = 'submitted' AND r.current_stage IS NOT NULL
         AND f.org_id IN (${placeholders})
       ORDER BY r.created_at DESC`,
      orgIds
    );
  }

  // 5. Filter to only tasks the user can act on
  const tasks = [];
  for (const row of taskRows) {
    const userRole = user.isSuperAdmin ? "owner" : orgRoleMap.get(row.org_id) ?? null;

    const allowedRoles: string[] = JSON.parse(row.allowed_roles || "[]");
    const allowedGroups: string[] = JSON.parse(row.allowed_groups || "[]");
    const allowedUsers: string[] = JSON.parse(row.allowed_users || "[]");

    if (!canUserActOnStage(user.userId, user.isSuperAdmin, userRole, userGroupIds, allowedRoles, allowedGroups, allowedUsers)) continue;

    tasks.push({
      ...serializeResponse(row),
      formTitle: row.form_title,
      formSlug: row.form_slug,
      stageName: row.stage_name,
      stageOrder: row.stage_order,
      totalStages: row.total_stages,
      allowedRoles,
      allowedGroups,
      allowedUsers,
    });
  }

  return c.json({ tasks });
});

// ── Workflow status for a response ──────────────────────────────────────────

responses.get("/:responseId/workflow-status", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string; form_id: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  // Get all workflow stages for the form
  const stages = await dbQuery<StageRow & { notify_on_ready: number }>(
    c.env.DB,
    "SELECT * FROM form_workflow_stages WHERE form_id = ? ORDER BY stage_order ASC",
    [row.form_id]
  );

  // Get group names for display
  const groupIds = stages.flatMap((s) => JSON.parse(s.allowed_groups || "[]") as string[]);
  const uniqueGroupIds = [...new Set(groupIds)];
  const groupNameMap = new Map<string, string>();

  if (uniqueGroupIds.length > 0) {
    const gPlaceholders = uniqueGroupIds.map(() => "?").join(",");
    const groupRows = await dbQuery<{ id: string; name: string }>(
      c.env.DB,
      `SELECT id, name FROM org_groups WHERE id IN (${gPlaceholders})`,
      uniqueGroupIds
    );
    for (const g of groupRows) groupNameMap.set(g.id, g.name);
  }

  const currentIdx = stages.findIndex((s) => s.id === row.current_stage);

  const stageDetails = stages.map((s, i) => ({
    id: s.id,
    name: s.name,
    stageOrder: s.stage_order,
    allowedRoles: JSON.parse(s.allowed_roles || "[]") as string[],
    allowedGroups: (JSON.parse(s.allowed_groups || "[]") as string[]).map((gId) => ({
      id: gId,
      name: groupNameMap.get(gId) ?? gId,
    })),
    allowedUsers: JSON.parse(s.allowed_users || "[]") as string[],
    isCompleted: row.status === "completed" || (currentIdx >= 0 && i < currentIdx),
    isCurrent: s.id === row.current_stage,
  }));

  return c.json({
    responseId: row.id,
    status: row.status,
    currentStage: row.current_stage,
    stages: stageDetails,
  });
});

// ── Advance response to next workflow stage ─────────────────────────────────

responses.post("/:responseId/advance", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  if (row.status !== "submitted" || !row.current_stage) {
    return c.json({ error: "Response is not in an active workflow stage" }, 400);
  }

  // Verify user has permission on the current stage
  const currentStage = await dbQueryFirst<StageRow>(
    c.env.DB,
    "SELECT * FROM form_workflow_stages WHERE id = ?",
    [row.current_stage]
  );

  if (!currentStage) {
    return c.json({ error: "Workflow stage not found" }, 404);
  }

  const userRole = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!userRole && !user.isSuperAdmin) return c.json({ error: "Access denied" }, 403);

  // Check if user can act on this stage
  const allowedRoles: string[] = JSON.parse(currentStage.allowed_roles || "[]");
  const allowedGroups: string[] = JSON.parse(currentStage.allowed_groups || "[]");
  const allowedUsers: string[] = JSON.parse(currentStage.allowed_users || "[]");

  // Get user's group memberships for the permission check
  const groupRows = await dbQuery<{ group_id: string }>(
    c.env.DB,
    "SELECT group_id FROM org_group_members WHERE user_id = ?",
    [user.userId]
  );
  const userGroupIds = new Set(groupRows.map((g) => g.group_id));

  if (!canUserActOnStage(user.userId, user.isSuperAdmin, userRole, userGroupIds, allowedRoles, allowedGroups, allowedUsers)) {
    return c.json({ error: "You do not have permission to advance this stage" }, 403);
  }

  // Get next stage
  const nextStage = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM form_workflow_stages WHERE form_id = ? AND stage_order > ? ORDER BY stage_order ASC LIMIT 1",
    [row.form_id, currentStage.stage_order]
  );

  const now = new Date().toISOString();

  if (nextStage) {
    // Move to next stage
    await dbRun(
      c.env.DB,
      "UPDATE form_responses SET current_stage = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      [nextStage.id, user.userId, now, responseId]
    );
    return c.json({ currentStage: nextStage.id, status: "submitted" });
  } else {
    // Last stage completed – mark as completed
    await dbRun(
      c.env.DB,
      "UPDATE form_responses SET current_stage = NULL, status = 'completed', updated_by = ?, updated_at = ? WHERE id = ?",
      [user.userId, now, responseId]
    );
    return c.json({ currentStage: null, status: "completed" });
  }
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

// Update response (admin/owner can edit all; editor can edit office-use fields)

/** Shared logic for PUT/PATCH /:responseId */
async function handleUpdateResponse(
  db: D1Database,
  userId: string,
  isSuperAdmin: boolean,
  responseId: string,
  body: { data?: Record<string, unknown>; isSpam?: boolean; submitterEmail?: string; status?: string },
): Promise<{ status: number; body: unknown }> {
  const row = await dbQueryFirst<ResponseRow & { org_id: string; fields: string }>(
    db,
    `SELECT r.*, f.org_id, f.fields FROM form_responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return { status: 404, body: { error: "Response not found" } };

  const role = isSuperAdmin
    ? "owner"
    : await getUserOrgRole(db, userId, row.org_id);

  if (!role || role === "viewer") {
    return { status: 403, body: { error: "Access denied" } };
  }

  // If editor (not admin/owner), restrict to office-use fields only
  if (role === "editor" && body.data) {
    const formFields = JSON.parse(row.fields) as { id: string; officeUse?: boolean; conditionalGroup?: { groupId: string; isGroupStart: boolean } }[];
    // Build a set of group IDs where the group-start field is office-use
    const officeUseGroupIds = new Set<string>();
    for (const f of formFields) {
      if (f.officeUse && f.conditionalGroup?.isGroupStart) {
        officeUseGroupIds.add(f.conditionalGroup.groupId);
      }
    }
    const officeFieldIds = new Set(
      formFields
        .filter((f) => f.officeUse || (f.conditionalGroup && officeUseGroupIds.has(f.conditionalGroup.groupId)))
        .map((f) => f.id),
    );
    const existingData = JSON.parse(row.data) as Record<string, unknown>;
    const mergedData = { ...existingData };
    for (const [key, value] of Object.entries(body.data)) {
      if (officeFieldIds.has(key) || officeFieldIds.has(key.replace(/_row_\d+$/, ""))) {
        mergedData[key] = value;
      }
    }
    body.data = mergedData;
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.data !== undefined) { sets.push("data = ?"); params.push(JSON.stringify(body.data)); }
  if (body.isSpam !== undefined) { sets.push("is_spam = ?"); params.push(body.isSpam ? 1 : 0); }
  if (body.submitterEmail !== undefined) { sets.push("submitter_email = ?"); params.push(body.submitterEmail); }
  if (body.status !== undefined) { sets.push("status = ?"); params.push(body.status); }

  if (sets.length === 0) {
    return { status: 400, body: { error: "No updates provided" } };
  }

  // Track who updated and when
  sets.push("updated_by = ?"); params.push(userId);
  sets.push("updated_at = ?"); params.push(new Date().toISOString());

  params.push(responseId);
  await dbRun(db, `UPDATE form_responses SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await dbQueryFirst<ResponseRow>(
    db,
    "SELECT * FROM form_responses WHERE id = ?",
    [responseId]
  );

  return { status: 200, body: serializeResponse(updated!) };
}

// Registered on both PUT and PATCH so the frontend patch() helper works.
responses.put("/:responseId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();
  const body = await c.req.json();
  const result = await handleUpdateResponse(c.env.DB, user.userId, user.isSuperAdmin, responseId, body);
  return c.json(result.body, result.status as 200);
});

responses.patch("/:responseId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();
  const body = await c.req.json();
  const result = await handleUpdateResponse(c.env.DB, user.userId, user.isSuperAdmin, responseId, body);
  return c.json(result.body, result.status as 200);
});

// ── Pre-fill / Draft endpoints ─────────────────────────────────────────────────

// Create a pre-fill draft (auth required, editor+)
responses.post("/form/:formId/prefill", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<{ org_id: string; status: string }>(
    c.env.DB,
    "SELECT org_id, status FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const id = generateId();
  const draftToken = generateId();
  const now = new Date().toISOString();
  const metadata = { submittedAt: "", ip: "", fingerprint: "", userAgent: "" };

  await dbRun(
    c.env.DB,
    `INSERT INTO form_responses (id, form_id, data, metadata, status, draft_token, updated_by, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [id, formId, JSON.stringify(body.data ?? {}), JSON.stringify(metadata), draftToken, user.userId, now]
  );

  console.log(`[RESPONSES] Pre-fill draft created id=${id} formId=${formId} token=${draftToken}`);

  return c.json({ id, draftToken, url: `/fill/${draftToken}` }, 201);
});

// Get draft form data by token (public, no auth required)
responses.get("/draft/:token", async (c) => {
  const { token } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { form_id: string }>(
    c.env.DB,
    `SELECT * FROM form_responses WHERE draft_token = ? AND status = 'draft'`,
    [token]
  );

  if (!row) return c.json({ error: "Draft not found or already submitted" }, 404);

  // Get form definition
  const formRow = await dbQueryFirst<FullFormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [row.form_id]
  );

  if (!formRow) return c.json({ error: "Form not found" }, 404);

  const formData = serializeForm(formRow);

  // Resolve option list references
  await resolveOptionListReferences(c.env.DB, formData.fields);

  // Attach org-level static values
  const staticRows = await dbQuery<{ key: string; value: string }>(
    c.env.DB,
    "SELECT key, value FROM org_static_values WHERE org_id = ?",
    [formRow.org_id]
  );

  // Remove access code from public response
  const { accessCode: _ac, ...safeFormData } = formData;

  return c.json({
    form: { ...safeFormData, staticValues: staticRows.map((r) => ({ key: r.key, value: r.value })) },
    data: JSON.parse(row.data),
    responseId: row.id,
  });
});

// Submit a draft (public, token-based)
const draftSubmitSchema = z.object({
  data: z.record(z.unknown()),
  turnstileToken: z.string().optional(),
});

responses.post("/draft/:token/submit", zValidator("json", draftSubmitSchema), async (c) => {
  const { token } = c.req.param();
  const { data, turnstileToken } = c.req.valid("json");

  const row = await dbQueryFirst<ResponseRow>(
    c.env.DB,
    `SELECT * FROM form_responses WHERE draft_token = ? AND status = 'draft'`,
    [token]
  );

  if (!row) return c.json({ error: "Draft not found or already submitted" }, 404);

  // Get form to check Turnstile setting
  const form = await dbQueryFirst<{ settings: string; slug: string; id: string }>(
    c.env.DB,
    "SELECT id, slug, settings FROM forms WHERE id = ?",
    [row.form_id]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const settings: FormSettings = JSON.parse(form.settings);

  // Turnstile verification if enabled
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

  const now = new Date().toISOString();
  const fingerprint = await generateFingerprint(c.req.raw);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const userAgent = c.req.header("User-Agent") ?? "";
  const metadata = { submittedAt: now, ip, fingerprint, userAgent };

  // Merge pre-filled data with submitted data
  const existingData = JSON.parse(row.data) as Record<string, unknown>;
  const mergedData = { ...existingData, ...data };

  // Extract submitter email if configured
  let submitterEmail: string | null = null;
  if (settings.receiptEmailField && mergedData[settings.receiptEmailField]) {
    submitterEmail = String(mergedData[settings.receiptEmailField]);
  }

  // If the form has workflow stages, start at the first stage
  const firstStageId = await getFirstWorkflowStageId(c.env.DB, row.form_id);

  await dbRun(
    c.env.DB,
    `UPDATE form_responses SET data = ?, metadata = ?, status = 'submitted', submitter_email = ?, fingerprint = ?, current_stage = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(mergedData), JSON.stringify(metadata), submitterEmail, fingerprint, firstStageId, now, row.id]
  );

  console.log(`[RESPONSES] Draft submitted id=${row.id} token=${token} stage=${firstStageId ?? 'none'}`);

  const message = settings.successMessage || "Thank you for your submission!";
  const redirectUrl = settings.redirectUrl;

  return c.json({ id: row.id, message, ...(redirectUrl ? { redirectUrl } : {}) }, 200);
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
