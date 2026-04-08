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

  return {
    uid: payload.uid as string,
    email: payload.email as string,
  };
}
