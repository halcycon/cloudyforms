import { dbQueryFirst } from "./db";

export interface SignupSettings {
  signupsEnabled: boolean;
  allowedDomains: string[];
  orgId?: string;
  orgName?: string;
  orgLogoUrl?: string;
  orgPrimaryColor?: string;
  scope: "platform" | "organization";
}

function parseDomainList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

async function getPlatformSignupSettings(db: D1Database): Promise<SignupSettings> {
  const enabled = await dbQueryFirst<{ value: string }>(
    db,
    "SELECT value FROM platform_settings WHERE key = 'signups_enabled'",
  );
  const domains = await dbQueryFirst<{ value: string }>(
    db,
    "SELECT value FROM platform_settings WHERE key = 'allowed_signup_domains'",
  );

  return {
    signupsEnabled: enabled ? enabled.value === "true" : true,
    allowedDomains: parseDomainList(domains?.value),
    scope: "platform",
  };
}

/**
 * Resolve signup restrictions for the current request.
 *
 * Platform and organisation toggles are independent and scope-specific:
 * - Main host (forms.thecuckoocamp.co.uk / workers.dev) → platform_settings only
 * - Org custom domain → that org's settings only (platform toggle ignored)
 *
 * Combined behaviour examples:
 * | Platform | Org (custom domain) | Main host      | Org custom domain |
 * | ON       | ON                  | Register OK    | Register OK       |
 * | ON       | OFF                 | Register OK    | Blocked           |
 * | OFF      | ON                  | Blocked        | Register OK       |
 * | OFF      | OFF                 | Blocked        | Blocked           |
 */
export async function resolveSignupSettings(
  db: D1Database,
  domainOrgId?: string,
): Promise<SignupSettings> {
  if (!domainOrgId) {
    return getPlatformSignupSettings(db);
  }

  const org = await dbQueryFirst<{
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    signups_enabled: number | null;
    allowed_signup_domains: string | null;
  }>(
    db,
    "SELECT name, logo_url, primary_color, signups_enabled, allowed_signup_domains FROM organizations WHERE id = ?",
    [domainOrgId],
  );

  if (!org) {
    return getPlatformSignupSettings(db);
  }

  return {
    signupsEnabled: org.signups_enabled !== 0,
    allowedDomains: parseDomainList(org.allowed_signup_domains),
    orgId: domainOrgId,
    orgName: org.name,
    orgLogoUrl: org.logo_url ?? undefined,
    orgPrimaryColor: org.primary_color ?? undefined,
    scope: "organization",
  };
}

export function emailMatchesAllowedDomains(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const emailDomain = email.toLowerCase().split("@")[1];
  if (!emailDomain) return false;
  return allowedDomains.some((d) => d.toLowerCase() === emailDomain);
}
