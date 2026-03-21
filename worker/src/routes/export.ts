import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { dbQuery, dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { getFile } from "../lib/r2";
import { generateId } from "../lib/auth";
import type { Bindings } from "../index";
import type { DocumentTemplate, FieldMapping, ComputedFieldMapping, BooleanDisplayMode } from "./forms";
import { slugify, ensureUniqueSlug } from "./forms";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { marked } from "marked";

const exportRouter = new Hono<{ Bindings: Bindings }>();

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

interface ResponseFileRow {
  id: string;
  response_id: string;
  field_id: string;
  file_key: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
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

function formatDate(format: string): string {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  // Replace in descending length order to avoid partial matches
  return format
    .replace("MMMM", months[month - 1])
    .replace("YYYY", String(year))
    .replace("DD", String(day).padStart(2, "0"))
    .replace("MM", String(month).padStart(2, "0"))
    .replace(/\bD\b/, String(day));
}

function evaluateComputedField(
  cm: ComputedFieldMapping,
  data: Record<string, unknown>,
  fields: { id: string; label?: string; type?: string }[]
): string {
  switch (cm.type) {
    case "static":
      return cm.value ?? "";

    case "date":
      return formatDate(cm.value ?? "DD/MM/YYYY");

    case "calculated": {
      const fieldIds = cm.calculationFieldIds ?? [];
      if (cm.calculationType === "count_non_empty") {
        let count = 0;
        for (const fid of fieldIds) {
          const val = getFieldValue(data, fields, fid);
          if (val.trim()) count++;
        }
        return String(count);
      }
      if (cm.calculationType === "sum") {
        let sum = 0;
        for (const fid of fieldIds) {
          const val = parseFloat(getFieldValue(data, fields, fid));
          if (!isNaN(val)) sum += val;
        }
        return String(sum);
      }
      if (cm.calculationType === "expression" && cm.value) {
        // Replace {{Field Label}} placeholders with actual field values
        return cm.value.replace(/\{\{(.+?)\}\}/g, (_match, label: string) => {
          const trimmed = label.trim();
          const field = fields.find(
            (f) => (f.label ?? "").toLowerCase() === trimmed.toLowerCase()
          );
          if (!field) return "";
          return getFieldValue(data, fields, field.id);
        });
      }
      return cm.fallback ?? "";
    }

    case "conditional": {
      for (const cond of cm.conditions ?? []) {
        const fieldValue = getFieldValue(data, fields, cond.fieldId);
        let match = false;
        switch (cond.operator) {
          case "equals":
            match = fieldValue === cond.compareValue;
            break;
          case "not_equals":
            match = fieldValue !== cond.compareValue;
            break;
          case "contains":
            match = fieldValue.includes(cond.compareValue);
            break;
          case "not_empty":
            match = fieldValue.trim().length > 0;
            break;
          case "empty":
            match = fieldValue.trim().length === 0;
            break;
          case "greater_than":
            match = parseFloat(fieldValue) > parseFloat(cond.compareValue);
            break;
          case "less_than":
            match = parseFloat(fieldValue) < parseFloat(cond.compareValue);
            break;
        }
        if (match) return cond.output;
      }
      return cm.fallback ?? "";
    }

    default:
      return cm.fallback ?? "";
  }
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

      // Also fill computed mappings that target PDF form fields
      for (const cm of template.computedMappings ?? []) {
        if (cm.pdfFieldName) {
          const value = evaluateComputedField(cm, data, fields);
          try {
            const textField = pdfForm.getTextField(cm.pdfFieldName);
            textField.setText(value);
            hasFilledFormFields = true;
          } catch {
            // Not a text field – skip
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

  // Track shrinkable field widths for shifting subsequent fields on the same line
  // Key: "page:y" -> running x offset
  const shrinkOffsets = new Map<string, number>();

  for (const mapping of template.fieldMappings) {
    if (hasFilledFormFields && mapping.pdfFieldName) continue;

    const pageIndex = (mapping.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height } = page.getSize();
    const value = getFieldValue(data, fields, mapping.fieldId);
    // For repeatable group row variants (e.g. "address_row_2"), fall back to the base field definition
    const fieldDef = fields.find((f) => f.id === mapping.fieldId)
      ?? fields.find((f) => f.id === mapping.fieldId.replace(/_row_\d+$/, ""));
    const isBoolean = fieldDef?.type === "checkbox";

    const fontSize = mapping.fontSize ?? 12;
    const color = mapping.fontColor
      ? hexToRgb(mapping.fontColor)
      : { r: 0, g: 0, b: 0 };

    // Handle boolean display modes
    if (isBoolean && mapping.booleanDisplay && mapping.booleanDisplay !== "text") {
      const isTruthy = isTruthyValue(value);
      const symbol = mapping.booleanDisplay === "checkmark" ? "✓" : "✕";

      // Determine which position to use based on true/false
      const posMapping = isTruthy
        ? mapping.booleanTrueMapping ?? mapping
        : mapping.booleanFalseMapping ?? mapping;

      const posPage = (posMapping.page || mapping.page || 1) - 1;
      if (posPage >= 0 && posPage < pages.length) {
        const targetPage = pages[posPage];
        const { height: pH } = targetPage.getSize();
        targetPage.drawText(symbol, {
          x: posMapping.x,
          y: pH - posMapping.y - fontSize,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }
      continue;
    }

    if (!value) continue;

    // Handle boolean text display
    const displayValue =
      isBoolean && (!mapping.booleanDisplay || mapping.booleanDisplay === "text")
        ? (isTruthyValue(value) ? "Yes" : "No")
        : value;

    // Calculate actual x considering shrinkable offset from a previous field
    const yKey = `${pageIndex}:${Math.round(mapping.y)}`;
    let xPos = mapping.x;
    const offsetForLine = shrinkOffsets.get(yKey);
    if (offsetForLine !== undefined) {
      xPos = offsetForLine;
    }

    page.drawText(displayValue, {
      x: xPos,
      y: height - mapping.y - fontSize,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      maxWidth: mapping.width || undefined,
    });

    // If this field is shrinkable, track its actual rendered width
    if (mapping.shrinkable) {
      const textWidth = font.widthOfTextAtSize(displayValue, fontSize);
      const gap = fontSize * 0.3; // small gap between adjacent fields
      shrinkOffsets.set(yKey, xPos + textWidth + gap);
    }
  }

  // Overlay computed/static field values
  for (const cm of template.computedMappings ?? []) {
    if (hasFilledFormFields && cm.pdfFieldName) continue;

    const pageIndex = (cm.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height } = page.getSize();
    const value = evaluateComputedField(cm, data, fields);
    if (!value) continue;

    const fontSize = cm.fontSize ?? 12;
    const color = cm.fontColor
      ? hexToRgb(cm.fontColor)
      : { r: 0, g: 0, b: 0 };

    page.drawText(value, {
      x: cm.x,
      y: height - cm.y - fontSize,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      maxWidth: cm.width || undefined,
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

  // Replace repeatable group row variant placeholders e.g. {{Label (Row 2)}} or {{fieldId_row_2}}
  for (const key of Object.keys(data)) {
    const rowMatch = key.match(/^(.+)_row_(\d+)$/);
    if (!rowMatch) continue;
    const baseId = rowMatch[1];
    const rowNum = rowMatch[2];
    const baseField = fields.find((f) => f.id === baseId);
    const value = getFieldValue(data, fields, key);
    if (baseField?.label) {
      content = content.replace(
        new RegExp(`\\{\\{\\s*${escapeRegex(baseField.label)}\\s*\\(\\s*Row\\s*${rowNum}\\s*\\)\\s*\\}\\}`, "gi"),
        value
      );
    }
    content = content.replace(
      new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "gi"),
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

// ── Form config export ─────────────────────────────────────────────────────────

// Export form configuration only (no responses)
exportRouter.get("/form/:formId/config", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  const exportPayload = {
    _cloudyforms: "form-config",
    _version: 1,
    title: form.title,
    description: form.description,
    fields: JSON.parse(form.fields),
    settings: JSON.parse(form.settings),
    branding: JSON.parse(form.branding),
    documentTemplate: form.document_template ? JSON.parse(form.document_template) : null,
    accessType: form.access_type,
    exportedAt: new Date().toISOString(),
  };

  const filename = `${form.title.replace(/[^a-z0-9]/gi, "_")}-config.json`;

  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// Export form configuration + responses (bundle)
exportRouter.get("/form/:formId/bundle", authMiddleware, async (c) => {
  const user = c.get("user");
  const { formId } = c.req.param();

  const form = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [formId]
  );

  if (!form) return c.json({ error: "Form not found" }, 404);

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, form.org_id);

  if (!role) return c.json({ error: "Access denied" }, 403);

  // Fetch all responses
  const responses = await dbQuery<ResponseRow>(
    c.env.DB,
    "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at ASC",
    [formId]
  );

  // Fetch all response files and encode them as base64
  const responseIds = responses.map((r) => r.id);
  const fileAttachments: Record<
    string,
    { fieldId: string; fileName: string; contentType: string; base64: string }[]
  > = {};

  if (responseIds.length > 0) {
    // Fetch files in batches to avoid massive queries
    const fileRows = await dbQuery<ResponseFileRow>(
      c.env.DB,
      `SELECT id, response_id, field_id, file_key, file_name, file_size, content_type
       FROM response_files WHERE response_id IN (${responseIds.map(() => "?").join(",")})`,
      responseIds
    );

    for (const fileRow of fileRows) {
      let base64Data = "";
      try {
        const fileObj = await getFile(c.env.R2, fileRow.file_key);
        if (fileObj) {
          const buf = await fileObj.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
          base64Data = btoa(binary);
        }
      } catch {
        // Skip files that can't be read
      }

      if (!fileAttachments[fileRow.response_id]) {
        fileAttachments[fileRow.response_id] = [];
      }
      fileAttachments[fileRow.response_id].push({
        fieldId: fileRow.field_id,
        fileName: fileRow.file_name,
        contentType: fileRow.content_type ?? "application/octet-stream",
        base64: base64Data,
      });
    }
  }

  // Also encode inline data that looks like file URLs (signatures, uploaded images)
  const fields = JSON.parse(form.fields) as { id: string; type?: string }[];
  const fileFieldIds = new Set(
    fields.filter((f) => f.type === "file" || f.type === "signature").map((f) => f.id)
  );

  const serializedResponses = responses.map((r) => {
    const data = JSON.parse(r.data) as Record<string, unknown>;
    const metadata = JSON.parse(r.metadata);

    // For signature fields that contain data URIs, keep them as-is
    // For file fields with R2 URLs, they'll be in the fileAttachments
    return {
      data,
      metadata,
      submitterEmail: r.submitter_email,
      isSpam: r.is_spam === 1,
      createdAt: r.created_at,
      files: fileAttachments[r.id] ?? [],
    };
  });

  const exportPayload = {
    _cloudyforms: "form-bundle",
    _version: 1,
    title: form.title,
    description: form.description,
    fields: JSON.parse(form.fields),
    settings: JSON.parse(form.settings),
    branding: JSON.parse(form.branding),
    documentTemplate: form.document_template ? JSON.parse(form.document_template) : null,
    accessType: form.access_type,
    responses: serializedResponses,
    exportedAt: new Date().toISOString(),
  };

  const filename = `${form.title.replace(/[^a-z0-9]/gi, "_")}-bundle.json`;

  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// ── Form import ────────────────────────────────────────────────────────────────

const importFormSchema = z.object({
  orgId: z.string().min(1),
  data: z.object({
    _cloudyforms: z.enum(["form-config", "form-bundle"]),
    _version: z.number(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    fields: z.array(z.any()),
    settings: z.any().optional(),
    branding: z.any().optional(),
    documentTemplate: z.any().nullable().optional(),
    accessType: z.enum(["public", "unlisted", "code", "kiosk_only"]).optional(),
    responses: z.array(z.any()).optional(),
    exportedAt: z.string().optional(),
  }),
  includeResponses: z.boolean().default(false),
});

exportRouter.post("/import", authMiddleware, zValidator("json", importFormSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const role = user.isSuperAdmin
    ? "owner"
    : await getUserOrgRole(c.env.DB, user.userId, body.orgId);

  if (!role || role === "viewer") {
    return c.json({ error: "Access denied" }, 403);
  }

  const cfg = body.data;
  const formId = generateId();
  const slug = await ensureUniqueSlug(c.env.DB, slugify(cfg.title));
  const now = new Date().toISOString();

  const defaultSettings = {
    submitButtonText: "Submit",
    successMessage: "Thank you for your submission!",
    allowMultipleSubmissions: true,
    requireAuth: false,
    sendReceiptEmail: false,
    notificationEmails: [],
    enableTurnstile: false,
    kioskOnly: false,
  };

  const settings = JSON.stringify({ ...defaultSettings, ...(cfg.settings ?? {}) });
  const branding = JSON.stringify(cfg.branding ?? {});
  const fields = JSON.stringify(cfg.fields ?? []);
  const documentTemplate = cfg.documentTemplate ? JSON.stringify(cfg.documentTemplate) : null;

  await dbRun(
    c.env.DB,
    `INSERT INTO forms (id, org_id, title, description, slug, status, access_type, access_code, fields, settings, branding, document_template, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      formId, body.orgId, cfg.title, cfg.description ?? null, slug,
      cfg.accessType ?? "public", fields, settings, branding,
      documentTemplate, user.userId, now, now,
    ]
  );

  // Import responses if requested and available
  let importedResponses = 0;
  if (body.includeResponses && cfg.responses && cfg.responses.length > 0) {
    for (const resp of cfg.responses) {
      const respId = generateId();
      const respData = JSON.stringify(resp.data ?? {});
      const respMetadata = JSON.stringify(resp.metadata ?? {});

      await dbRun(
        c.env.DB,
        `INSERT INTO form_responses (id, form_id, data, metadata, submitter_email, fingerprint, is_spam, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          respId, formId, respData, respMetadata,
          resp.submitterEmail ?? null,
          resp.isSpam ? 1 : 0,
          resp.createdAt ?? now,
        ]
      );

      // Import file attachments if present
      if (resp.files && Array.isArray(resp.files)) {
        for (const file of resp.files) {
          if (file.base64 && file.fileName) {
            const fileId = generateId();
            const fileKey = `${generateId()}.${file.fileName.split(".").pop() ?? "bin"}`;

            // Decode base64 and upload to R2
            try {
              const binaryStr = atob(file.base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              await c.env.R2.put(fileKey, bytes.buffer, {
                httpMetadata: { contentType: file.contentType ?? "application/octet-stream" },
              });

              await dbRun(
                c.env.DB,
                `INSERT INTO response_files (id, response_id, field_id, file_key, file_name, file_size, content_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  fileId, respId, file.fieldId ?? "", fileKey,
                  file.fileName, bytes.length, file.contentType ?? "application/octet-stream", now,
                ]
              );
            } catch {
              // Skip files that fail to import
            }
          }
        }
      }

      importedResponses++;
    }
  }

  // Fetch the created form
  const createdForm = await dbQueryFirst<FormRow>(
    c.env.DB,
    "SELECT * FROM forms WHERE id = ?",
    [formId]
  );

  return c.json(
    {
      id: formId,
      title: cfg.title,
      slug,
      importedResponses,
      form: createdForm
        ? {
            id: createdForm.id,
            orgId: createdForm.org_id,
            title: createdForm.title,
            description: createdForm.description,
            slug: createdForm.slug,
            status: createdForm.status,
            accessType: createdForm.access_type,
            fields: JSON.parse(createdForm.fields),
            settings: JSON.parse(createdForm.settings),
            branding: JSON.parse(createdForm.branding),
            documentTemplate: createdForm.document_template
              ? JSON.parse(createdForm.document_template)
              : null,
          }
        : null,
    },
    201
  );
});

export { exportRouter as exportRoutes };
