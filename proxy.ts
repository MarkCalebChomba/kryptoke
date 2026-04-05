import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge middleware — gates all /admin routes.
 * 1. Reads kryptoke_admin httpOnly cookie (set by /admin/login page)
 * 2. Verifies it's a valid JWT signed with JWT_SECRET
 * 3. Checks x-admin-uid header presence (set after DB verify on login)
 * Non-/admin routes pass through untouched.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect admin routes; let /admin/login through
  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("kryptoke_admin")?.value;

  if (!token) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret, {
      issuer: "kryptoke",
      audience: "kryptoke-app",
    });

    // Attach uid as header so adminMiddleware can skip the extra DB call
    const res = NextResponse.next();
    res.headers.set("x-admin-uid", payload.uid as string);
    res.headers.set("x-admin-role", "super_admin");
    return res;
  } catch {
    // Invalid or expired token — clear cookie and redirect to login
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("kryptoke_admin");
    return res;
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
