import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimal middleware — only protects /admin routes.
 * App routes (/me, /markets, etc.) use client-side JWT auth via useAppStore.
 * We skip Supabase session checks here because they add 2-5s per navigation.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate the admin dashboard
  if (pathname.startsWith("/admin")) {
    // Check for admin session cookie set during admin login
    const adminToken = request.cookies.get("_kk_adm")?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
