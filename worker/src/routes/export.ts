import { Hono } from "hono";
import { dbQuery, dbQueryFirst } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const exportRouter = new Hono<{ Bindings: Bindings }>();

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  fields: string;
}

interface ResponseRow {
  id: string;
  form_id: string;
  data: string;
  metadata: string;
  submitter_email: string | null;
  is_spam: number;
  created_at: string;
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

function escapeCsvValue(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

function buildCsv(
  fields: { id: string; label?: string }[],
  responses: ResponseRow[]
): string {
  const headers = [
    "Response ID",
    "Submitted At",
    "Submitter Email",
    "Is Spam",
    ...fields.map((f) => f.label ?? f.id),
  ];

  const rows = responses.map((r) => {
    const data = JSON.parse(r.data) as Record<string, unknown>;
    const metadata = JSON.parse(r.metadata) as { submittedAt?: string };
    return buildCsvRow([
      r.id,
      metadata.submittedAt ?? r.created_at,
      r.submitter_email ?? "",
      r.is_spam === 1 ? "true" : "false",
      ...fields.map((f) => {
        const val = data[f.id];
        if (Array.isArray(val)) return val.join("; ");
        return val ?? "";
      }),
    ]);
  });

  return [buildCsvRow(headers), ...rows].join("\r\n");
}

// Export all responses for a form as CSV
exportRouter.get("/form/:formId/csv", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT id, org_id, title, fields FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const responses = await dbQuery<ResponseRow>(
    c.env.DB,
    "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at ASC",
    [formId]
  );

  const fields = JSON.parse(form.fields) as { id: string; label?: string; type?: string }[];
  const dataFields = fields.filter(
    (f) => !["heading", "paragraph", "divider"].includes(f.type ?? "")
  );

  const csv = buildCsv(dataFields, responses);
  const filename = `${form.title.replace(/[^a-z0-9]/gi, "_")}-responses.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// Export all responses for a form as JSON
exportRouter.get("/form/:formId/json", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT id, org_id, title, fields FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const responses = await dbQuery<ResponseRow>(
    c.env.DB,
    "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at ASC",
    [formId]
  );

  const fields = JSON.parse(form.fields) as { id: string; label?: string }[];

  const data = responses.map((r) => {
    const responseData = JSON.parse(r.data) as Record<string, unknown>;
    const metadata = JSON.parse(r.metadata);
    const labeled: Record<string, unknown> = {};

    for (const field of fields) {
      if (responseData[field.id] !== undefined) {
        labeled[field.label ?? field.id] = responseData[field.id];
      }
    }

    return {
      id: r.id,
      submittedAt: metadata.submittedAt ?? r.created_at,
      submitterEmail: r.submitter_email,
      isSpam: r.is_spam === 1,
      data: labeled,
      raw: responseData,
    };
  });

  const filename = `${form.title.replace(/[^a-z0-9]/gi, "_")}-responses.json`;

  return new Response(
    JSON.stringify({ form: { id: form.id, title: form.title }, responses: data }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    }
  );
});

// Export single response as CSV
exportRouter.get("/response/:responseId/csv", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string; fields: string; title: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id, f.fields, f.title
     FROM form_responses r JOIN forms f ON f.id = r.form_id
     WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const fields = (JSON.parse(row.fields) as { id: string; label?: string; type?: string }[]).filter(
    (f) => !["heading", "paragraph", "divider"].includes(f.type ?? "")
  );

  const csv = buildCsv(fields, [row]);
  const filename = `response-${responseId}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// Export single response as JSON
exportRouter.get("/response/:responseId/json", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<ResponseRow & { org_id: string; fields: string; title: string }>(
    c.env.DB,
    `SELECT r.*, f.org_id, f.fields, f.title
     FROM form_responses r JOIN forms f ON f.id = r.form_id
     WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const fields = JSON.parse(row.fields) as { id: string; label?: string }[];
  const responseData = JSON.parse(row.data) as Record<string, unknown>;
  const metadata = JSON.parse(row.metadata);
  const labeled: Record<string, unknown> = {};

  for (const field of fields) {
    if (responseData[field.id] !== undefined) {
      labeled[field.label ?? field.id] = responseData[field.id];
    }
  }

  const filename = `response-${responseId}.json`;

  return new Response(
    JSON.stringify(
      {
        id: row.id,
        formTitle: row.title,
        submittedAt: metadata.submittedAt ?? row.created_at,
        submitterEmail: row.submitter_email,
        isSpam: row.is_spam === 1,
        data: labeled,
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    }
  );
});

export { exportRouter as exportRoutes };
