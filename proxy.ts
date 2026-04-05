import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware — no longer gates /admin at the edge.
 * Admin API endpoints are protected server-side by adminMiddleware
 * which checks the admin_users table on every request.
 */
export async function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
