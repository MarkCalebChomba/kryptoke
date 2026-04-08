import { SignJWT, jwtVerify } from "jose";

interface JwtPayload {
  uid: string;
  email: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  // Bug #1 fix: hard error — no fallback to hardcoded string
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET environment variable is not set or is too short. " +
        "Generate one with: openssl rand -base64 64"
    );
  }

  return new TextEncoder().encode(secret);
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  const secret = getSecret();

  return new SignJWT({ uid: payload.uid, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("kryptoke")
    .setAudience("kryptoke-app")
    // sub = uid so Supabase auth.uid() works when this JWT is passed
    // to the Supabase browser client for Realtime subscriptions.
    // See: supabase/migrations/012_rls_custom_jwt.sql
    .setSubject(payload.uid)
    .sign(secret);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const secret = getSecret();

  const { payload } = await jwtVerify(token, secret, {
    issuer: "kryptoke",
    audience: "kryptoke-app",
  });

  if (!payload.uid || !payload.email) {
    throw new Error("Invalid JWT payload");
  }

  // ── Revocation check ────────────────────────────────────────────────────────
  // Revoke a token by writing revoked_token:{last20chars} to Redis with 7d TTL.
  // We use the last 20 chars (signature tail) as a cheap fingerprint —
  // unique enough for this use case without storing full tokens.
  const tokenSuffix = token.slice(-20);
  try {
    const { redis } = await import("@/lib/redis/client");
    const revoked = await redis.get(`revoked_token:${tokenSuffix}`);
    if (revoked) {
      throw new Error("Token has been revoked");
    }
  } catch (err) {
    // Re-throw explicit revocation errors
    if (err instanceof Error && err.message === "Token has been revoked") {
      throw err;
    }
    // Redis connectivity failure — fail open to avoid locking out all users,
    // but log so we can alert on it
    console.error("[verifyJwt] Redis revocation check failed:", err);
  }

  return {
    uid: payload.uid as string,
    email: payload.email as string,
  };
}

/**
 * Revoke a JWT token immediately.
 * Stores the token's last-20-char suffix in Redis with a TTL.
 * Any subsequent verifyJwt call with this token will fail with 401.
 *
 * Usage (e.g. admin panel or security incident response):
 *   await revokeJwt(exposedToken);
 *
 * TTL defaults to 7 days (max token lifetime). Pass a shorter value
 * if you know the token expires sooner.
 */
export async function revokeJwt(token: string, ttlSeconds = 7 * 24 * 60 * 60): Promise<void> {
  const tokenSuffix = token.slice(-20);
  const { redis } = await import("@/lib/redis/client");
  await redis.set(`revoked_token:${tokenSuffix}`, "1", { ex: ttlSeconds });
}
