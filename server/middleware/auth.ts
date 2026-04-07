import type { Context, Next } from "hono";
import { verifyJwt } from "@/server/services/jwt";
import { touchLastActive } from "@/server/db/users";

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

    // Check account suspension before allowing any authenticated request
    try {
      const { redis } = await import("@/lib/redis/client");
      const suspendKey = `suspended:${payload.uid}`;
      const cached = await redis.get<{ until: string; reason: string }>(suspendKey);

      let isSuspended = false;
      let suspendReason = "";

      if (cached) {
        if (new Date(cached.until) > new Date()) {
          isSuspended = true;
          suspendReason = cached.reason;
        } else {
          await redis.del(suspendKey); // Suspension expired
        }
      } else {
        // Check DB (cold path — not cached)
        const { getDb } = await import("@/server/db/client");
        const db = getDb();
        const { data: user } = await db
          .from("users")
          .select("suspended_until, suspension_reason")
          .eq("uid", payload.uid)
          .single();

        if (user?.suspended_until && new Date(user.suspended_until) > new Date()) {
          isSuspended = true;
          suspendReason = user.suspension_reason ?? "Account suspended";
          // Cache for 60s to avoid DB on every request
          await redis.set(suspendKey, { until: user.suspended_until, reason: suspendReason }, { ex: 60 });
        }
      }

      if (isSuspended) {
        return c.json({
          success: false,
          error: `Account suspended: ${suspendReason}`,
          code: "ACCOUNT_SUSPENDED",
          statusCode: 403,
        }, 403);
      }
    } catch { /* Non-fatal — proceed if suspension check fails */ }

    c.set("user", { uid: payload.uid, email: payload.email });

    // Fire-and-forget last active — throttled to once per 5 min per user via Redis
    (async () => {
      try {
        const { redis } = await import("@/lib/redis/client");
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
    const { isAdminUser } = await import("@/server/db/users");
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
