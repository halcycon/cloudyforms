import invitationTemplate from "../email-templates/invitation.html";
import formReceiptTemplate from "../email-templates/form-receipt.html";
import formNotificationTemplate from "../email-templates/form-notification.html";
import { dbQueryFirst } from "./db";

export interface EmailBranding {
  orgName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

const DEFAULT_PRIMARY = "#6366f1";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  creator: "Creator",
  viewer: "Viewer",
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value ?? "");
  }
  return out;
}

function primaryColor(branding: EmailBranding): string {
  const c = branding.primaryColor?.trim();
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_PRIMARY;
}

function logoBlock(branding: EmailBranding): string {
  if (!branding.logoUrl) {
    return `<p style="margin:0;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(branding.orgName)}</p>`;
  }
  return `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.orgName)}" width="120" style="display:block;border:0;height:auto;max-width:180px;margin:0 auto;">`;
}

function fieldRowsHtml(fields: { label?: string; value?: unknown }[]): string {
  const rows = fields
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;width:35%">${escapeHtml(String(f.label ?? ""))}</td>
        <td style="padding:8px 12px;color:#4b5563;border:1px solid #e5e7eb">${escapeHtml(String(f.value ?? ""))}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px">${rows}</table>`;
}

function fieldRowsText(fields: { label?: string; value?: unknown }[]): string {
  return fields.map((f) => `${f.label ?? "Field"}: ${f.value ?? ""}`).join("\n");
}

export async function getOrgEmailBranding(
  db: D1Database,
  orgId: string,
): Promise<EmailBranding> {
  const org = await dbQueryFirst<{
    name: string;
    logo_url: string | null;
    primary_color: string | null;
  }>(db, "SELECT name, logo_url, primary_color FROM organizations WHERE id = ?", [orgId]);

  return {
    orgName: org?.name ?? "CloudyForms",
    logoUrl: org?.logo_url,
    primaryColor: org?.primary_color,
  };
}

export function renderOrgInviteEmail(
  branding: EmailBranding,
  params: {
    invitedByName: string;
    registerUrl: string;
    role: string;
    expiry?: string;
  },
): { html: string; text: string } {
  const expiry = params.expiry ?? "7 days";
  const roleLabel = ROLE_LABELS[params.role] ?? params.role;
  const color = primaryColor(branding);

  const html = fillTemplate(invitationTemplate, {
    orgName: escapeHtml(branding.orgName),
    logoBlock: logoBlock(branding),
    invitedByName: escapeHtml(params.invitedByName),
    roleLabel: escapeHtml(roleLabel),
    registerUrl: escapeHtml(params.registerUrl),
    expiry: escapeHtml(expiry),
    primaryColor: color,
  });

  const text = [
    `${params.invitedByName} has invited you to join ${branding.orgName} on CloudyForms as a ${roleLabel}.`,
    "",
    `Create your account using this link (expires in ${expiry}):`,
    params.registerUrl,
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");

  return { html, text };
}

export function renderFormReceiptEmail(
  branding: EmailBranding,
  params: {
    formTitle: string;
    responseId: string;
    fields: { label?: string; value?: unknown }[];
  },
): { html: string; text: string } {
  const color = primaryColor(branding);
  const html = fillTemplate(formReceiptTemplate, {
    orgName: escapeHtml(branding.orgName),
    logoBlock: logoBlock(branding),
    formTitle: escapeHtml(params.formTitle),
    responseId: escapeHtml(params.responseId),
    fieldRows: fieldRowsHtml(params.fields),
    primaryColor: color,
  });

  const text = [
    `Thanks for submitting "${params.formTitle}"!`,
    "",
    `Reference ID: ${params.responseId}`,
    "",
    fieldRowsText(params.fields),
  ].join("\n");

  return { html, text };
}

export function renderFormNotificationEmail(
  branding: EmailBranding,
  params: {
    formTitle: string;
    responseId: string;
    submitterEmail?: string;
    fields: { label?: string; value?: unknown }[];
  },
): { html: string; text: string } {
  const color = primaryColor(branding);
  const submitterLine = params.submitterEmail
    ? ` by <strong>${escapeHtml(params.submitterEmail)}</strong>`
    : "";

  const html = fillTemplate(formNotificationTemplate, {
    orgName: escapeHtml(branding.orgName),
    logoBlock: logoBlock(branding),
    formTitle: escapeHtml(params.formTitle),
    responseId: escapeHtml(params.responseId),
    submitterLine,
    fieldRows: fieldRowsHtml(params.fields),
    primaryColor: color,
  });

  const text = [
    `New response for "${params.formTitle}"`,
    params.submitterEmail ? `Submitter: ${params.submitterEmail}` : "",
    `Response ID: ${params.responseId}`,
    "",
    fieldRowsText(params.fields),
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}
