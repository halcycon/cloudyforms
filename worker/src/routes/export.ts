import { Hono } from "hono";
import { dbQuery, dbQueryFirst } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { getFile } from "../lib/r2";
import type { Bindings } from "../index";
import type { DocumentTemplate, FieldMapping } from "./forms";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { marked } from "marked";

const exportRouter = new Hono<{ Bindings: Bindings }>();

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  fields: string;
  document_template: string | null;
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

// ── PDF generation helpers ─────────────────────────────────────────────────────

// A4 page dimensions in PDF points (1 point = 1/72 inch)
const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

function isTruthyValue(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return ["true", "yes", "1", "on", "checked"].includes(lower);
}

function getFieldValue(
  data: Record<string, unknown>,
  fields: { id: string; label?: string }[],
  fieldId: string
): string {
  const val = data[fieldId];
  if (val === undefined || val === null) return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

async function generatePdfFromTemplate(
  pdfBytes: ArrayBuffer,
  template: DocumentTemplate,
  data: Record<string, unknown>,
  fields: { id: string; label?: string; type?: string }[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Try to fill fillable form fields first
  let hasFilledFormFields = false;
  try {
    const pdfForm = pdfDoc.getForm();
    const pdfFields = pdfForm.getFields();
    if (pdfFields.length > 0) {
      for (const mapping of template.fieldMappings) {
        if (mapping.pdfFieldName) {
          const value = getFieldValue(data, fields, mapping.fieldId);
          try {
            const textField = pdfForm.getTextField(mapping.pdfFieldName);
            textField.setText(value);
            hasFilledFormFields = true;
          } catch {
            // Field might not exist or might not be a text field; try checkbox
            try {
              const checkBox = pdfForm.getCheckBox(mapping.pdfFieldName);
              if (isTruthyValue(value)) {
                checkBox.check();
              } else {
                checkBox.uncheck();
              }
              hasFilledFormFields = true;
            } catch {
              // Not a checkbox either – skip
            }
          }
        }
      }
    }
  } catch {
    // No form fields in the PDF – that's fine, we'll overlay text
  }

  // Overlay text for any mappings that don't target a PDF form field
  // or when no form fields were successfully filled
  const pages = pdfDoc.getPages();
  for (const mapping of template.fieldMappings) {
    if (hasFilledFormFields && mapping.pdfFieldName) continue;

    const pageIndex = (mapping.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height } = page.getSize();
    const value = getFieldValue(data, fields, mapping.fieldId);
    if (!value) continue;

    const fontSize = mapping.fontSize ?? 12;
    const color = mapping.fontColor ? hexToRgb(mapping.fontColor) : { r: 0, g: 0, b: 0 };

    page.drawText(value, {
      x: mapping.x,
      y: height - mapping.y - fontSize,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      maxWidth: mapping.width || undefined,
    });
  }

  return pdfDoc.save();
}

async function generatePdfFromMarkdown(
  markdownContent: string,
  data: Record<string, unknown>,
  fields: { id: string; label?: string; type?: string }[]
): Promise<Uint8Array> {
  // Replace field placeholders {{field_label}} or {{field_id}} with values
  let content = markdownContent;
  for (const field of fields) {
    const value = getFieldValue(data, fields, field.id);
    content = content.replace(
      new RegExp(`\\{\\{\\s*${escapeRegex(field.label ?? field.id)}\\s*\\}\\}`, "gi"),
      value
    );
    content = content.replace(
      new RegExp(`\\{\\{\\s*${escapeRegex(field.id)}\\s*\\}\\}`, "gi"),
      value
    );
  }

  // Parse markdown to tokens
  const tokens = marked.lexer(content);

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = A4_WIDTH_POINTS;
  const pageHeight = A4_HEIGHT_POINTS;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function drawWrappedText(
    text: string,
    fontSize: number,
    font: typeof fontRegular,
    color = rgb(0, 0, 0),
    indent = 0
  ) {
    const words = text.split(/\s+/);
    let line = "";
    const lineHeight = fontSize * 1.4;
    const maxWidth = contentWidth - indent;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && line) {
        ensureSpace(lineHeight);
        page.drawText(line, {
          x: margin + indent,
          y: y - fontSize,
          size: fontSize,
          font,
          color,
        });
        y -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y: y - fontSize,
        size: fontSize,
        font,
        color,
      });
      y -= lineHeight;
    }
  }

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const sizes: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 12, 6: 11 };
        const fontSize = sizes[token.depth] ?? 12;
        y -= fontSize * 0.5; // spacing before heading
        drawWrappedText(token.text, fontSize, fontBold);
        y -= fontSize * 0.3; // spacing after heading
        break;
      }
      case "paragraph": {
        // Handle bold/italic inline
        const text = token.text
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/__(.+?)__/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/_(.+?)_/g, "$1");
        drawWrappedText(text, 11, fontRegular);
        y -= 6; // paragraph spacing
        break;
      }
      case "list": {
        for (let i = 0; i < token.items.length; i++) {
          const item = token.items[i];
          const bullet = token.ordered ? `${i + 1}. ` : "• ";
          const text = item.text
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/_(.+?)_/g, "$1");
          drawWrappedText(`${bullet}${text}`, 11, fontRegular, rgb(0, 0, 0), 15);
        }
        y -= 4;
        break;
      }
      case "hr": {
        ensureSpace(10);
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 10;
        break;
      }
      case "blockquote": {
        const text = token.text
          ?.replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/_(.+?)_/g, "$1") ?? "";
        drawWrappedText(text, 11, fontItalic, rgb(0.3, 0.3, 0.3), 20);
        y -= 6;
        break;
      }
      case "space": {
        y -= 6;
        break;
      }
      default: {
        // For any unrecognized token with raw text, render as paragraph
        if ("text" in token && typeof token.text === "string") {
          drawWrappedText(token.text, 11, fontRegular);
          y -= 6;
        }
        break;
      }
    }
  }

  return pdfDoc.save();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Export response as filled PDF
exportRouter.get("/response/:responseId/pdf", authMiddleware, async (c) => {
  const user = c.get("user");
  const { responseId } = c.req.param();

  const row = await dbQueryFirst<
    ResponseRow & { org_id: string; fields: string; title: string; document_template: string | null }
  >(
    c.env.DB,
    `SELECT r.*, f.org_id, f.fields, f.title, f.document_template
     FROM form_responses r JOIN forms f ON f.id = r.form_id
     WHERE r.id = ?`,
    [responseId]
  );

  if (!row) return c.json({ error: "Response not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, row.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  if (!row.document_template) {
    return c.json({ error: "No document template configured for this form" }, 400);
  }

  const template: DocumentTemplate = JSON.parse(row.document_template);
  if (!template.enabled) {
    return c.json({ error: "Document template is not enabled" }, 400);
  }

  const fields = JSON.parse(row.fields) as { id: string; label?: string; type?: string }[];
  const data = JSON.parse(row.data) as Record<string, unknown>;

  let pdfResult: Uint8Array;

  if (template.type === "pdf") {
    if (!template.fileKey) {
      return c.json({ error: "No PDF template file uploaded" }, 400);
    }

    const fileObj = await getFile(c.env.R2, template.fileKey);
    if (!fileObj) {
      return c.json({ error: "Template PDF file not found in storage" }, 404);
    }

    const pdfBytes = await fileObj.arrayBuffer();
    pdfResult = await generatePdfFromTemplate(pdfBytes, template, data, fields);
  } else if (template.type === "markdown") {
    if (!template.markdownContent) {
      return c.json({ error: "No markdown content in template" }, 400);
    }

    pdfResult = await generatePdfFromMarkdown(template.markdownContent, data, fields);
  } else {
    return c.json({ error: "Unknown template type" }, 400);
  }

  const filename = `${row.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}-response-${responseId}.pdf`;

  return new Response(pdfResult, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

export { exportRouter as exportRoutes };
