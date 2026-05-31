const DEFAULT_SERVER = "https://ntfy.sh";
const MAX_MESSAGE_LENGTH = 3800;

/** Hostnames we refuse to call from the worker (basic SSRF guard). */
const BLOCKED_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[::1\]|::1)/i;

export interface NtfyNotificationConfig {
  serverUrl?: string;
  topic: string;
  authEnabled?: boolean;
  authToken?: string;
}

export interface NtfyNotificationParams {
  serverUrl?: string;
  topic: string;
  title: string;
  message: string;
  tags?: string[];
  clickUrl?: string;
  authToken?: string;
}

export function normalizeNtfyServerUrl(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_SERVER;
  let url = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function buildNtfyPublishUrl(serverUrl: string, topic: string): string | null {
  const topicClean = topic.trim().replace(/^\/+/, "");
  if (!topicClean) return null;

  let base: URL;
  try {
    base = new URL(normalizeNtfyServerUrl(serverUrl));
  } catch {
    return null;
  }

  if (base.protocol !== "http:" && base.protocol !== "https:") return null;
  if (BLOCKED_HOST.test(base.hostname)) return null;

  const segments = topicClean.split("/").filter(Boolean).map(encodeURIComponent);
  base.pathname = `/${segments.join("/")}`;
  return base.toString();
}

function truncateMessage(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

export async function sendNtfyNotification(params: NtfyNotificationParams): Promise<void> {
  const url = buildNtfyPublishUrl(params.serverUrl ?? "", params.topic);
  if (!url) {
    throw new Error("Invalid ntfy server URL or topic");
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: params.title.slice(0, 250),
  };
  if (params.tags?.length) {
    headers.Tags = params.tags.join(",");
  }
  if (params.clickUrl) {
    headers.Click = params.clickUrl;
  }
  if (params.authToken?.trim()) {
    headers.Authorization = `Bearer ${params.authToken.trim()}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: truncateMessage(params.message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ntfy publish failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}
