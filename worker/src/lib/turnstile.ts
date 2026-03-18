interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export async function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string
): Promise<boolean> {
  if (!secretKey) return true; // skip verification if no key configured

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (ip) {
    body.set("remoteip", ip);
  }

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!res.ok) return false;

    const data = (await res.json()) as TurnstileResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
