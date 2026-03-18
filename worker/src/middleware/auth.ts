import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { verifyToken } from "../lib/auth";
import { dbQueryFirst } from "../lib/db";
import type { Bindings } from "../index";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    orgRole: string;
  }
}

function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings }> =
  createMiddleware(async (c, next) => {
    const token = extractToken(c.req.header("Authorization") ?? null);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const payload = await verifyToken(token, c.env.JWT_SECRET);
      const user = await dbQueryFirst<{
        id: string;
        email: string;
        name: string;
        is_super_admin: number;
      }>(c.env.DB, "SELECT id, email, name, is_super_admin FROM users WHERE id = ?", [
        payload.userId,
      ]);

      if (!user) {
        return c.json({ error: "User not found" }, 401);
      }

      c.set("user", {
        userId: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.is_super_admin === 1,
      });

      await next();
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  });

export const optionalAuthMiddleware: MiddlewareHandler<{ Bindings: Bindings }> =
  createMiddleware(async (c, next) => {
    const token = extractToken(c.req.header("Authorization") ?? null);
    if (token) {
      try {
        const payload = await verifyToken(token, c.env.JWT_SECRET);
        const user = await dbQueryFirst<{
          id: string;
          email: string;
          name: string;
          is_super_admin: number;
        }>(c.env.DB, "SELECT id, email, name, is_super_admin FROM users WHERE id = ?", [
          payload.userId,
        ]);

        if (user) {
          c.set("user", {
            userId: user.id,
            email: user.email,
            name: user.name,
            isSuperAdmin: user.is_super_admin === 1,
          });
        }
      } catch {
        // silently ignore invalid token for optional auth
      }
    }
    await next();
  });

export function requireRole(
  ...roles: string[]
): MiddlewareHandler<{ Bindings: Bindings }> {
  return createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (user.isSuperAdmin) {
      await next();
      return;
    }

    const orgId =
      c.req.param("orgId") ?? c.req.query("orgId");

    if (!orgId) {
      return c.json({ error: "Organization ID required" }, 400);
    }

    const member = await dbQueryFirst<{ role: string }>(
      c.env.DB,
      "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
      [orgId, user.userId]
    );

    if (!member) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    const roleHierarchy: Record<string, number> = {
      owner: 4,
      admin: 3,
      editor: 2,
      viewer: 1,
    };

    const userLevel = roleHierarchy[member.role] ?? 0;
    const hasRole = roles.some((r) => userLevel >= (roleHierarchy[r] ?? 99));

    if (!hasRole) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    c.set("orgRole", member.role);
    await next();
  });
}
