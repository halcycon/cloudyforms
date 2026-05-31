/**
 * Outbound email — Cloudflare Email Service or Mailchannels, per org/platform config.
 */

import type { Bindings } from "../index";
import {
  buildFromHeader,
  type ResolvedEmailConfig,
  resolveEmailConfig,
} from "./email-config";

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Overrides the name part of the From header (e.g. organisation name). */
  fromName?: string;
}

function parseFromBinding(raw: string): { email: string; name?: string } | string {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return {
      email: m[2].trim(),
      name: m[1].trim().replace(/^["']|["']$/g, ""),
    };
  }
  return s;
}

function parseFromRest(raw: string): { address: string; name?: string } | string {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return {
      address: m[2].trim(),
      name: m[1].trim().replace(/^["']|["']$/g, ""),
    };
  }
  return s;
}

async function sendViaCloudflare(
  options: EmailOptions,
  env: Bindings,
  from: { email: string; name?: string },
): Promise<void> {
  if (env.EMAIL?.send) {
    const parsed = parseFromBinding(
      from.name ? `${from.name} <${from.email}>` : from.email,
    );
    const fromField =
      typeof parsed === "string"
        ? { email: parsed, ...(from.name ? { name: from.name } : {}) }
        : parsed;
    const result = await env.EMAIL.send({
      to: options.to,
      from: fromField,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    if (result && typeof result === "object" && "error" in result && result.error) {
      throw new Error(`Email send failed: ${String(result.error)}`);
    }
    return;
  }

  const token = env.EMAIL_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Cloudflare Email not configured: add [[send_email]] binding or set EMAIL_API_TOKEN and CF_ACCOUNT_ID.",
    );
  }

  const parsed = parseFromRest(from.name ? `${from.name} <${from.email}>` : from.email);
  const fromField =
    typeof parsed === "string"
      ? { address: parsed, ...(from.name ? { name: from.name } : {}) }
      : parsed;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: options.to,
      from: fromField,
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string; code?: string | number }[];
  };
  if (!res.ok || body.success === false) {
    const err = body.errors?.[0]?.message || body.errors?.[0]?.code || res.statusText;
    throw new Error(`Email API failed: ${err}`);
  }
}

async function sendViaMailchannels(
  options: EmailOptions,
  env: Bindings,
  from: { email: string; name?: string },
): Promise<void> {
  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.MAILCHANNELS_API_KEY
        ? { "X-Auth-Api-Key": env.MAILCHANNELS_API_KEY }
        : {}),
    },
    body: JSON.stringify({
      from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      subject: options.subject,
      content: [
        { type: "text/html", value: options.html },
        { type: "text/plain", value: options.text },
      ],
      personalizations: [
        {
          to: [
            {
              email: options.to,
              ...(options.toName ? { name: options.toName } : {}),
            },
          ],
        },
      ],
    }),
  });

  if (res.status !== 202) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Mailchannels send failed (${res.status}): ${detail}`);
  }
}

export async function sendEmailWithConfig(
  options: EmailOptions,
  env: Bindings,
  config: ResolvedEmailConfig,
): Promise<void> {
  const from = buildFromHeader(config, options.fromName);

  if (config.provider === "mailchannels") {
    await sendViaMailchannels(options, env, from);
  } else {
    await sendViaCloudflare(options, env, from);
  }
}

/** Send using org-specific (or platform) email provider and From address. */
export async function sendOrgEmail(
  db: D1Database,
  env: Bindings,
  orgId: string,
  options: EmailOptions,
): Promise<void> {
  const config = await resolveEmailConfig(db, env, orgId);
  await sendEmailWithConfig(options, env, config);
}
