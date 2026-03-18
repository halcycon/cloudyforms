import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { nanoid } from "nanoid";

export interface TokenPayload extends JWTPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

export async function signToken(
  payload: Omit<TokenPayload, keyof JWTPayload>,
  secret: string,
  expiresIn: string = "7d"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload> {
  const secretKey = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, secretKey);
  return payload as TokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

export function generateId(): string {
  return nanoid(21);
}
