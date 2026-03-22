import type { Context, Next } from "hono";
import { getDb } from "@/server/db/client";

export async function timingMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const user = c.get("user");

  // Fire-and-forget — never block the response
  const db = getDb();
  db.from("api_metrics")
    .insert({
      route: new URL(c.req.url).pathname,
      method: c.req.method,
      status_code: c.res.status,
      duration_ms: duration,
      uid: user?.uid ?? null,
    })
    .then(() => undefined)
    .catch(() => undefined);
}
