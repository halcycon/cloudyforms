import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  hashPassword,
  verifyPassword,
  signToken,
  generateId,
} from "../lib/auth";
import { dbQueryFirst, dbRun } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const auth = new Hono<{ Bindings: Bindings }>();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

// Public endpoint: check whether new signups are allowed
auth.get("/signup-status", async (c) => {
  const enabled = await dbQueryFirst<{ value: string }>(
    c.env.DB,
    "SELECT value FROM platform_settings WHERE key = 'signups_enabled'",
  );
  const domains = await dbQueryFirst<{ value: string }>(
    c.env.DB,
    "SELECT value FROM platform_settings WHERE key = 'allowed_signup_domains'",
  );
  return c.json({
    signupsEnabled: enabled ? enabled.value === "true" : true,
    allowedDomains: domains?.value ? JSON.parse(domains.value) as string[] : [],
  });
});

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { name, email, password } = c.req.valid("json");
  const redacted = `***@${email.split("@")[1] ?? "?"}`;
  console.log(`[AUTH] Registration attempt email=${redacted}`);

  // Check if signups are disabled
  const signupsSetting = await dbQueryFirst<{ value: string }>(
    c.env.DB,
    "SELECT value FROM platform_settings WHERE key = 'signups_enabled'",
  );
  if (signupsSetting && signupsSetting.value === "false") {
    console.log(`[AUTH] Registration blocked – signups disabled email=${redacted}`);
    return c.json({ error: "New account registration is currently disabled" }, 403);
  }

  // Check allowed email domains
  const domainsSetting = await dbQueryFirst<{ value: string }>(
    c.env.DB,
    "SELECT value FROM platform_settings WHERE key = 'allowed_signup_domains'",
  );
  if (domainsSetting?.value) {
    const allowedDomains = JSON.parse(domainsSetting.value) as string[];
    if (allowedDomains.length > 0) {
      const emailDomain = email.toLowerCase().split("@")[1];
      if (!emailDomain || !allowedDomains.some((d) => d.toLowerCase() === emailDomain)) {
        console.log(`[AUTH] Registration blocked – domain not allowed email=${redacted}`);
        return c.json({ error: "Registration is restricted to certain email domains" }, 403);
      }
    }
  }

  const existing = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM users WHERE email = ?",
    [email.toLowerCase()]
  );

  if (existing) {
    console.log(`[AUTH] Registration failed – email in use email=${redacted}`);
    return c.json({ error: "Email already in use" }, 409);
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await dbRun(
    c.env.DB,
    "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, email.toLowerCase(), name, passwordHash, now, now]
  );

  const token = await signToken(
    { userId: id, email: email.toLowerCase(), isSuperAdmin: false },
    c.env.JWT_SECRET
  );

  console.log(`[AUTH] Registration successful userId=${id} email=${redacted}`);

  return c.json(
    {
      user: { id, email: email.toLowerCase(), name },
      token,
    },
    201
  );
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const redacted = `***@${email.split("@")[1] ?? "?"}`;
  console.log(`[AUTH] Login attempt email=${redacted}`);

  const user = await dbQueryFirst<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    is_super_admin: number;
  }>(c.env.DB, "SELECT id, email, name, password_hash, is_super_admin FROM users WHERE email = ?", [
    email.toLowerCase(),
  ]);

  if (!user) {
    console.log(`[AUTH] Login failed – user not found email=${redacted}`);
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    console.log(`[AUTH] Login failed – wrong password email=${redacted}`);
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signToken(
    {
      userId: user.id,
      email: user.email,
      isSuperAdmin: user.is_super_admin === 1,
    },
    c.env.JWT_SECRET
  );

  console.log(`[AUTH] Login successful userId=${user.id} email=${redacted}`);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.is_super_admin === 1,
    },
    token,
  });
});

auth.post("/logout", (c) => {
  // JWT is stateless; client discards the token
  return c.json({ message: "Logged out" });
});

auth.get("/me", authMiddleware, async (c) => {
  const authUser = c.get("user");

  const user = await dbQueryFirst<{
    id: string;
    email: string;
    name: string;
    is_super_admin: number;
    created_at: string;
  }>(
    c.env.DB,
    "SELECT id, email, name, is_super_admin, created_at FROM users WHERE id = ?",
    [authUser.userId]
  );

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.is_super_admin === 1,
    createdAt: user.created_at,
  });
});

auth.on(["PUT", "PATCH"], "/me", authMiddleware, zValidator("json", updateProfileSchema), async (c) => {
  const authUser = c.get("user");
  const updates = c.req.valid("json");

  if (updates.email) {
    const existing = await dbQueryFirst<{ id: string }>(
      c.env.DB,
      "SELECT id FROM users WHERE email = ? AND id != ?",
      [updates.email.toLowerCase(), authUser.userId]
    );
    if (existing) {
      return c.json({ error: "Email already in use" }, 409);
    }
  }

  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [new Date().toISOString()];

  if (updates.name) {
    sets.push("name = ?");
    params.push(updates.name);
  }
  if (updates.email) {
    sets.push("email = ?");
    params.push(updates.email.toLowerCase());
  }

  params.push(authUser.userId);

  await dbRun(
    c.env.DB,
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    params
  );

  const user = await dbQueryFirst<{
    id: string;
    email: string;
    name: string;
    is_super_admin: number;
  }>(
    c.env.DB,
    "SELECT id, email, name, is_super_admin FROM users WHERE id = ?",
    [authUser.userId]
  );

  return c.json({
    id: user!.id,
    email: user!.email,
    name: user!.name,
    isSuperAdmin: user!.is_super_admin === 1,
  });
});

auth.post(
  "/change-password",
  authMiddleware,
  zValidator("json", changePasswordSchema),
  async (c) => {
    const authUser = c.get("user");
    const { currentPassword, newPassword } = c.req.valid("json");

    const user = await dbQueryFirst<{ password_hash: string }>(
      c.env.DB,
      "SELECT password_hash FROM users WHERE id = ?",
      [authUser.userId]
    );

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return c.json({ error: "Current password is incorrect" }, 400);
    }

    const newHash = await hashPassword(newPassword);
    await dbRun(
      c.env.DB,
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [newHash, new Date().toISOString(), authUser.userId]
    );

    return c.json({ message: "Password changed" });
  }
);

export { auth as authRoutes };
