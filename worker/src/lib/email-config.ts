import { dbQueryFirst } from "./db";
import type { Bindings } from "../index";

export type EmailProvider = "cloudflare" | "mailchannels";

export interface ResolvedEmailConfig {
  provider: EmailProvider;
  /** Full From header value, e.g. `Org Name <noreply@example.com>` or `noreply@example.com` */
  fromRaw: string;
}

export function parseFromAddress(raw: string): { email: string; name?: string } {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return {
      name: m[1].trim().replace(/^["']|["']$/g, ""),
      email: m[2].trim(),
    };
  }
  return { email: s };
}

function envDefaultFrom(env: Bindings): string {
  return env.EMAIL_FROM || env.FROM_EMAIL || "CloudyForms <noreply@thecuckoocamp.co.uk>";
}

async function getPlatformSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await dbQueryFirst<{ value: string }>(
    db,
    "SELECT value FROM platform_settings WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function getPlatformEmailConfig(
  db: D1Database,
  env: Bindings,
): Promise<ResolvedEmailConfig> {
  const providerRaw = await getPlatformSetting(db, "email_provider");
  const fromRaw = await getPlatformSetting(db, "email_from");

  const provider: EmailProvider =
    providerRaw === "mailchannels" ? "mailchannels" : "cloudflare";

  return {
    provider,
    fromRaw: fromRaw?.trim() || envDefaultFrom(env),
  };
}

export async function resolveEmailConfig(
  db: D1Database,
  env: Bindings,
  orgId?: string | null,
): Promise<ResolvedEmailConfig> {
  const platform = await getPlatformEmailConfig(db, env);
  if (!orgId) return platform;

  const org = await dbQueryFirst<{
    email_provider: string | null;
    email_from: string | null;
  }>(
    db,
    "SELECT email_provider, email_from FROM organizations WHERE id = ?",
    [orgId],
  );

  if (!org) return platform;

  const provider: EmailProvider =
    org.email_provider === "mailchannels"
      ? "mailchannels"
      : org.email_provider === "cloudflare"
        ? "cloudflare"
        : platform.provider;

  const fromRaw = org.email_from?.trim() || platform.fromRaw;

  return { provider, fromRaw };
}

/** Combine resolved From with an optional display name (e.g. org name). */
export function buildFromHeader(
  config: ResolvedEmailConfig,
  displayName?: string,
): { email: string; name?: string } {
  const parsed = parseFromAddress(config.fromRaw);
  if (displayName && !parsed.name) {
    return { email: parsed.email, name: displayName };
  }
  return parsed;
}
