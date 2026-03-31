import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 proxy (replaces middleware.ts) — only protects /admin routes.
 * App routes (/me, /markets, etc.) use client-side JWT auth via useAppStore.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate the admin dashboard
  if (pathname.startsWith("/admin")) {
    const adminToken = request.cookies.get("kryptoke_admin")?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
