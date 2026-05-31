import type { FormSettings } from "../routes/forms";
import {
  getOrgEmailBranding,
  renderFormNotificationEmail,
  sendOrgEmail,
  type EmailBranding,
} from "./email";
import {
  effectiveNotifyByEmail,
  resolveNotificationEmails,
} from "./notification-settings";
import { sendNtfyNotification } from "./ntfy";
import type { Bindings } from "../index";

export interface ResponseNotificationContext {
  orgId: string;
  formTitle: string;
  responseId: string;
  formCreatedBy?: string | null;
  submitterEmail?: string | null;
  fields: { label?: string; value?: unknown }[];
}

export { effectiveNotifyByEmail, hasEmailNotificationTargets } from "./notification-settings";

export function effectiveNotifyByNtfy(settings: FormSettings): boolean {
  if (settings.notifyByNtfy !== undefined) return settings.notifyByNtfy;
  return !!settings.ntfy?.topic?.trim();
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildNtfyMessage(ctx: ResponseNotificationContext): string {
  const lines = [
    `New response for "${ctx.formTitle}"`,
    ctx.submitterEmail ? `From: ${ctx.submitterEmail}` : null,
    `ID: ${ctx.responseId}`,
    "",
  ].filter((line): line is string => line !== null);

  for (const field of ctx.fields) {
    const label = field.label ?? "Field";
    const value = formatFieldValue(field.value);
    if (!value) continue;
    lines.push(`${label}: ${value}`);
  }

  return lines.join("\n");
}

async function sendEmailNotifications(
  db: D1Database,
  env: Bindings,
  branding: EmailBranding,
  settings: FormSettings,
  ctx: ResponseNotificationContext,
): Promise<void> {
  if (!effectiveNotifyByEmail(settings)) return;

  const recipients = await resolveNotificationEmails(
    db,
    settings,
    ctx.orgId,
    ctx.formCreatedBy,
  );
  if (recipients.length === 0) return;

  const { html, text } = renderFormNotificationEmail(branding, {
    formTitle: ctx.formTitle,
    responseId: ctx.responseId,
    submitterEmail: ctx.submitterEmail ?? undefined,
    fields: ctx.fields,
  });

  for (const email of recipients) {
    sendOrgEmail(db, env, ctx.orgId, {
      to: email,
      subject: `New response: ${ctx.formTitle}`,
      html,
      text,
      fromName: branding.orgName,
    }).catch((err) => console.error("[EMAIL] Notification send failed:", err));
  }
}

async function sendNtfyNotifications(
  settings: FormSettings,
  ctx: ResponseNotificationContext,
): Promise<void> {
  if (!effectiveNotifyByNtfy(settings)) return;

  const topic = settings.ntfy?.topic?.trim();
  if (!topic) return;

  const authToken =
    settings.ntfy?.authEnabled && settings.ntfy.authToken?.trim()
      ? settings.ntfy.authToken.trim()
      : undefined;

  sendNtfyNotification({
    serverUrl: settings.ntfy?.serverUrl,
    topic,
    title: `New response: ${ctx.formTitle}`,
    message: buildNtfyMessage(ctx),
    tags: ["form", "cloudyforms"],
    authToken,
  }).catch((err) => console.error("[NTFY] Notification send failed:", err));
}

/** Fire-and-forget email and ntfy notifications for a new form response. */
export async function sendFormResponseNotifications(
  db: D1Database,
  env: Bindings,
  settings: FormSettings,
  ctx: ResponseNotificationContext,
): Promise<void> {
  const branding = await getOrgEmailBranding(db, ctx.orgId);
  await Promise.all([
    sendEmailNotifications(db, env, branding, settings, ctx),
    sendNtfyNotifications(settings, ctx),
  ]);
}
