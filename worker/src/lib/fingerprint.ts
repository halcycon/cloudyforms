async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ua = request.headers.get("User-Agent") ?? "";
  const lang = request.headers.get("Accept-Language") ?? "";
  const encoding = request.headers.get("Accept-Encoding") ?? "";

  const raw = `${ip}|${ua}|${lang}|${encoding}`;
  return sha256Hex(raw);
}
