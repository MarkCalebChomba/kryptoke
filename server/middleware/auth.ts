import type { Context, Next } from "hono";
import { verifyJwt } from "@/server/services/jwt";
import { touchLastActive, isAdminUser } from "@/server/db/users";
import { redis } from "@/lib/redis/client";

export interface AuthContext {
  uid: string;
  email: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthContext;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authorization = c.req.header("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return c.json(
      { success: false, error: "Authentication required", statusCode: 401 },
      401
    );
  }

  const token = authorization.slice(7);

  try {
    const payload = await verifyJwt(token);
    c.set("user", { uid: payload.uid, email: payload.email });

    // Fire-and-forget last active — throttled to once per 5 min per user via Redis
    (async () => {
      try {
        const key = `last_active_touched:${payload.uid}`;
        const already = await redis.get(key);
        if (!already) {
          await redis.set(key, "1", { ex: 5 * 60 });
          await touchLastActive(payload.uid);
        }
      } catch {
        // Non-fatal
      }
    })();

    await next();
  } catch {
    return c.json(
      { success: false, error: "Invalid or expired session", statusCode: 401 },
      401
    );
  }
}

export async function adminMiddleware(c: Context, next: Next): Promise<Response | void> {
  // First run auth middleware
  const authResult = await authMiddleware(c, async () => {});
  if (authResult) return authResult;

  const user = c.get("user");

  // Check admin header set by Next.js middleware
  const adminRole = c.req.header("x-admin-role");
  if (!adminRole) {
    // Double-check via DB for direct Lambda calls
    const isAdmin = await isAdminUser(user.uid);
    if (!isAdmin) {
      return c.json(
        { success: false, error: "Admin access required", statusCode: 403 },
        403
      );
    }
  }

  await next();
}
