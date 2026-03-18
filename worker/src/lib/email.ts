import type { Bindings } from "../index";

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

interface MailchannelsPersonalization {
  to: { email: string; name?: string }[];
}

interface MailchannelsPayload {
  from: { email: string; name?: string };
  subject: string;
  content: { type: string; value: string }[];
  personalizations: MailchannelsPersonalization[];
}

export async function sendEmail(
  options: EmailOptions,
  env: Bindings
): Promise<boolean> {
  const fromEmail = options.from ?? env.FROM_EMAIL;
  const fromName = options.fromName ?? "CloudyForms";

  const payload: MailchannelsPayload = {
    from: { email: fromEmail, name: fromName },
    subject: options.subject,
    content: [
      { type: "text/html", value: options.html },
      ...(options.text
        ? [{ type: "text/plain", value: options.text }]
        : []),
    ],
    personalizations: [
      {
        to: [{ email: options.to, ...(options.toName ? { name: options.toName } : {}) }],
      },
    ],
  };

  try {
    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.MAILCHANNELS_API_KEY
          ? { "X-Auth-Api-Key": env.MAILCHANNELS_API_KEY }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    return res.status === 202;
  } catch {
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFieldRows(fields: { label?: string; value?: unknown }[]): string {
  return fields
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;width:35%">${escapeHtml(String(f.label ?? ""))}</td>
        <td style="padding:8px 12px;color:#4b5563;border:1px solid #e5e7eb">${escapeHtml(String(f.value ?? ""))}</td>
      </tr>`
    )
    .join("");
}

export function buildFormReceiptEmail(
  formTitle: string,
  responseId: string,
  fields: { label?: string; value?: unknown }[]
): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Form Submission Receipt</title></head>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#6366f1;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">Thanks for your submission!</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151">Your response to <strong>${escapeHtml(formTitle)}</strong> has been received.</p>
      <p style="color:#6b7280;font-size:13px">Reference ID: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${escapeHtml(responseId)}</code></p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        ${buildFieldRows(fields)}
      </table>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
      Sent by CloudyForms
    </div>
  </div>
</body>
</html>`;

  const text = `Thanks for submitting "${formTitle}"!\n\nReference ID: ${responseId}\n\n${fields.map((f) => `${f.label}: ${f.value}`).join("\n")}`;

  return { html, text };
}

export function buildNotificationEmail(
  formTitle: string,
  responseId: string,
  submitterEmail: string,
  fields: { label?: string; value?: unknown }[]
): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Form Response</title></head>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#6366f1;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">New Response: ${escapeHtml(formTitle)}</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151">A new response has been submitted${submitterEmail ? ` by <strong>${escapeHtml(submitterEmail)}</strong>` : ""}.</p>
      <p style="color:#6b7280;font-size:13px">Response ID: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${escapeHtml(responseId)}</code></p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        ${buildFieldRows(fields)}
      </table>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
      Sent by CloudyForms
    </div>
  </div>
</body>
</html>`;

  const text = `New response for "${formTitle}"\n\nResponse ID: ${responseId}\nSubmitter: ${submitterEmail || "anonymous"}\n\n${fields.map((f) => `${f.label}: ${f.value}`).join("\n")}`;

  return { html, text };
}
