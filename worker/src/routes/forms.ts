import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateId } from "../lib/auth";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings } from "../index";

const forms = new Hono<{ Bindings: Bindings }>();

// ── Types ──────────────────────────────────────────────────────────────────────

export type FormFieldType =
  | "text" | "textarea" | "number" | "email" | "phone" | "date"
  | "select" | "multiselect" | "radio" | "checkbox" | "file"
  | "rating" | "scale" | "heading" | "paragraph" | "divider" | "signature";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  accept?: string;
  maxSize?: number;
  content?: string; // for heading/paragraph
  order: number;
  conditionalLogic?: {
    fieldId: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
    value: string;
  };
}

export interface FormSettings {
  submitButtonText: string;
  successMessage: string;
  redirectUrl?: string;
  allowMultipleSubmissions: boolean;
  requireAuth: boolean;
  sendReceiptEmail: boolean;
  receiptEmailField?: string;
  notificationEmails: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  enableTurnstile: boolean;
  maxResponses?: number;
  expiresAt?: string;
  kioskOnly: boolean;
}

export interface BrandingConfig {
  primaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  showPoweredBy?: boolean;
}

export interface FieldMapping {
  fieldId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontColor?: string;
  pdfFieldName?: string;
}

export interface DocumentTemplate {
  enabled: boolean;
  type: "pdf" | "markdown";
  fileKey?: string;
  fileName?: string;
  markdownContent?: string;
  fieldMappings: FieldMapping[];
  pageCount?: number;
}

const defaultSettings: FormSettings = {
  submitButtonText: "Submit",
  successMessage: "Thank you for your submission!",
  allowMultipleSubmissions: true,
  requireAuth: false,
  sendReceiptEmail: false,
  notificationEmails: [],
  enableTurnstile: false,
  kioskOnly: false,
};

// ── Validation ─────────────────────────────────────────────────────────────────

const createFormSchema = z.object({
  orgId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  fields: z.array(z.any()).default([]),
  settings: z.any().optional(),
  branding: z.any().optional(),
  documentTemplate: z.any().optional(),
  accessType: z.enum(["public", "unlisted", "code", "kiosk_only"]).default("public"),
  accessCode: z.string().optional(),
});

const updateFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  fields: z.array(z.any()).optional(),
  settings: z.any().optional(),
  branding: z.any().optional(),
  documentTemplate: z.any().optional().nullable(),
  accessType: z.enum(["public", "unlisted", "code", "kiosk_only"]).optional(),
  accessCode: z.string().optional().nullable(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

interface OptionListRow {
  id: string;
  options: string;
}

/**
 * Resolve option list references in form fields (mutates in place).
 * If a field has `optionListId`, fetch the options from the option_lists table
 * and replace the field's options array with the latest values from the list.
 */
async function resolveOptionListReferences(
  db: D1Database,
  fields: Array<{ optionListId?: string; options?: { label: string; value: string }[] }>
) {
  const listIds = fields
    .map((f) => f.optionListId)
    .filter((id): id is string => !!id);

  if (listIds.length === 0) return;

  const unique = [...new Set(listIds)];
  const placeholders = unique.map(() => "?").join(", ");
  const rows = await dbQuery<OptionListRow>(
    db,
    `SELECT id, options FROM option_lists WHERE id IN (${placeholders})`,
    unique
  );

  const listMap = new Map<string, { label: string; value: string }[]>();
  for (const row of rows) {
    listMap.set(row.id, JSON.parse(row.options));
  }

  for (const field of fields) {
    if (field.optionListId && listMap.has(field.optionListId)) {
      field.options = listMap.get(field.optionListId)!;
    }
  }
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function ensureUniqueSlug(db: D1Database, base: string): Promise<string> {
  let slug = base;
  let suffix = 0;
  while (true) {
    const existing = await dbQueryFirst<{ id: string }>(
      db,
      "SELECT id FROM forms WHERE slug = ?",
      [slug]
    );
    if (!existing) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
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

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  slug: string;
  status: string;
  access_type: string;
  access_code: string | null;
  fields: string;
  settings: string;
  branding: string;
  document_template: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function serializeForm(row: FormRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description,
    slug: row.slug,
    status: row.status,
    accessType: row.access_type,
    accessCode: row.access_code,
    fields: JSON.parse(row.fields),
    settings: JSON.parse(row.settings),
    branding: JSON.parse(row.branding),
    documentTemplate: row.document_template ? JSON.parse(row.document_template) : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Public form by slug (no auth)
forms.get("/public/:formSlug", async (c) => {
  const { formSlug } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE slug = ? AND status = 'published'",
    [formSlug]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const settings: FormSettings = JSON.parse(form.settings);

  // Hide access code from public response
  const result = serializeForm(form);
  result.settings = { ...settings };
  if (form.access_code) {
    result.accessCode = undefined as unknown as null;
  }

  // Resolve option list references: replace optionListId with actual options
  await resolveOptionListReferences(c.env.DB, result.fields);

  return c.json(result);
});

// List forms
forms.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  if (!orgId) {
    console.log(`[FORMS] List failed – missing orgId user=${user.userId}`);
    return c.json({ error: "orgId query parameter is required" }, 400);
  }

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, orgId);

  if (!role) {
    return c.json({ error: "Access denied" }, 403);
  }

  const rows = await dbQuery<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE org_id = ? ORDER BY updated_at DESC",
    [orgId]
  );

  return c.json(rows.map(serializeForm));
});

// Create form
forms.post("/", authMiddleware, zValidator("json", createFormSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  console.log(`[FORMS] Create form title="${body.title}" orgId=${body.orgId} user=${user.userId}`);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, body.orgId);

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  const baseSlug = body.slug ?? slugify(body.title);
  const slug = await ensureUniqueSlug(c.env.DB, baseSlug);

  const id = generateId();
  const now = new Date().toISOString();
  const settings = JSON.stringify({ ...defaultSettings, ...(body.settings ?? {}) });
  const branding = JSON.stringify(body.branding ?? {});
  const fields = JSON.stringify(body.fields ?? []);
  const documentTemplate = body.documentTemplate ? JSON.stringify(body.documentTemplate) : null;

  await dbRun(
    c.env.DB,
    `INSERT INTO forms (id, org_id, title, description, slug, status, access_type, access_code, fields, settings, branding, document_template, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, body.orgId, body.title, body.description ?? null, slug,
      body.accessType, body.accessCode ?? null, fields, settings, branding,
      documentTemplate, user.userId, now, now,
    ]
  );

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [id]
  );

  return c.json(serializeForm(form!), 201);
});

// Get form
forms.get("/:formId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
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

  return c.json(serializeForm(form));
});

// Update form
forms.on(["PUT", "PATCH"],
  "/:formId",
  authMiddleware,
  zValidator("json", updateFormSchema),
  async (c) => {
    const user = c.get("user");
    const { formId } = c.req.param();
    const updates = c.req.valid("json");
    console.log(`[FORMS] Update form formId=${formId} user=${user.userId} fields=${Object.keys(updates).join(",")}`);

    const form = await dbQueryFirst<FormRow>(
      c.env.DB,
      "SELECT * FROM forms WHERE id = ?",
      [formId]
    );

    if (!form) {
      return c.json({ error: "Form not found" }, 404);
    }

    const role = user.isSuperAdmin
      ? "owner"
      : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

    if (!role || role === "viewer") {
      return c.json({ error: "Access denied" }, 403);
    }

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.title !== undefined) { sets.push("title = ?"); params.push(updates.title); }
    if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
    if (updates.fields !== undefined) { sets.push("fields = ?"); params.push(JSON.stringify(updates.fields)); }
    if (updates.settings !== undefined) {
      const merged = { ...JSON.parse(form.settings), ...updates.settings };
      sets.push("settings = ?");
      params.push(JSON.stringify(merged));
    }
    if (updates.branding !== undefined) {
      const merged = { ...JSON.parse(form.branding), ...updates.branding };
      sets.push("branding = ?");
      params.push(JSON.stringify(merged));
    }
    if (updates.documentTemplate !== undefined) {
      sets.push("document_template = ?");
      params.push(updates.documentTemplate ? JSON.stringify(updates.documentTemplate) : null);
    }
    if (updates.accessType !== undefined) { sets.push("access_type = ?"); params.push(updates.accessType); }
    if (updates.accessCode !== undefined) { sets.push("access_code = ?"); params.push(updates.accessCode); }

    params.push(formId);

    await dbRun(c.env.DB, `UPDATE forms SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await dbQueryFirst<FormRow>(
      c.env.DB,
      "SELECT * FROM forms WHERE id = ?",
      [formId]
    );

    return c.json(serializeForm(updated!));
  }
);

// Delete form
forms.delete("/:formId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();
  console.log(`[FORMS] Delete form formId=${formId} user=${user.userId}`);

  const form = await dbQueryFirst<FormRow>(
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

  if (!role || role === "viewer" || role === "editor") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(c.env.DB, "DELETE FROM forms WHERE id = ?", [formId]);

  return c.json({ message: "Form deleted" });
});

// Publish form
forms.post("/:formId/publish", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();
  console.log(`[FORMS] Publish form formId=${formId} user=${user.userId}`);

  const form = await dbQueryFirst<FormRow>(
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

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(
    c.env.DB,
    "UPDATE forms SET status = 'published', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), formId]
  );

  return c.json({ id: formId, status: "published" });
});

// Unpublish form
forms.post("/:formId/unpublish", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();
  console.log(`[FORMS] Unpublish form formId=${formId} user=${user.userId}`);

  const form = await dbQueryFirst<FormRow>(
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

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  await dbRun(
    c.env.DB,
    "UPDATE forms SET status = 'draft', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), formId]
  );

  return c.json({ id: formId, status: "draft" });
});

// Duplicate form
forms.post("/:formId/duplicate", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  const newId = generateId();
  const newSlug = await ensureUniqueSlug(c.env.DB, `${form.slug}-copy`);
  const now = new Date().toISOString();

  await dbRun(
    c.env.DB,
    `INSERT INTO forms (id, org_id, title, description, slug, status, access_type, access_code, fields, settings, branding, document_template, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId, form.org_id, `${form.title} (Copy)`, form.description, newSlug,
      form.access_type, form.access_code, form.fields, form.settings, form.branding,
      form.document_template, user.userId, now, now,
    ]
  );

  const duplicated = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [newId]
  );

  return c.json(serializeForm(duplicated!), 201);
});

export { forms as formRoutes };
