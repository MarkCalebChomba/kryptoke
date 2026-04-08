import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signJwt, revokeJwt } from "@/server/services/jwt";
import { sendEmailOtp, sendPhoneOtp, verifyOtp } from "@/server/services/otp";
import { deriveDepositAddress } from "@/server/services/wallet";
import {
  findUserByEmail,
  findUserByUid,
  createUser,
  updateUser,
  getNextHdIndex,
} from "@/server/db/users";
import { initializeUserBalances } from "@/server/db/balances";
import { getDb } from "@/server/db/client";
import { authMiddleware } from "@/server/middleware/auth";
import { withAuthRateLimit, withOtpRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { normalizeKenyanPhone, isValidKenyanPhone } from "@/lib/utils/formatters";
import type { User } from "@/types";

async function invalidateUserCache(uid: string): Promise<void> {
  const { redis } = await import("@/lib/redis/client");
  await redis.del(`user:me:${uid}`).catch(() => undefined);
}


const auth = new Hono();

/* ─── Schemas ───────────────────────────────────────────────────────────── */

const registerSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  phone: z.string().refine(isValidKenyanPhone, "Invalid Kenyan phone number"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  referralCode: z.string().min(1).max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

const verifyEmailSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const verifyPhoneSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const sendOtpSchema = z.object({
  type: z.enum(["email", "phone"]),
  identifier: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

const setAssetPinSchema = z.object({
  pin: z.string().length(6, "PIN must be exactly 6 digits").regex(/^\d+$/, "PIN must be digits only"),
  currentPin: z.string().length(6).regex(/^\d+$/).optional(),
});

const verifyAssetPinSchema = z.object({
  pin: z.string().length(6).regex(/^\d+$/),
});

/* ─── Helper: map DB user to API User type ──────────────────────────────── */

function toApiUser(row: {
  uid: string;
  email: string;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  hd_index: number;
  deposit_address: string;
  kyc_status: "pending" | "submitted" | "verified" | "rejected";
  asset_pin_hash: string | null;
  totp_enabled?: boolean;
  anti_phishing_code?: string | null;
  language: "en" | "sw";
  data_saver: boolean;
  auto_earn: boolean;
  created_at: string;
  last_active_at: string;
}): User {
  return {
    uid: row.uid,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    hdIndex: row.hd_index,
    depositAddress: row.deposit_address,
    kycStatus: row.kyc_status,
    assetPinSet: !!row.asset_pin_hash,
    totpEnabled: row.totp_enabled ?? false,
    antiPhishingSet: !!row.anti_phishing_code,
    language: row.language,
    dataSaver: row.data_saver,
    autoEarn: row.auto_earn,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/* ─── POST /register ────────────────────────────────────────────────────── */

auth.post(
  "/register",
  withAuthRateLimit(),
  zValidator("json", registerSchema),
  async (c) => {
    const { email, phone, password, referralCode } = c.req.valid("json");
    const normalizedPhone = normalizeKenyanPhone(phone);

    // Check email not already taken
    const existing = await findUserByEmail(email);
    if (existing) {
      return c.json(
        { success: false, error: "An account with this email already exists", statusCode: 409 },
        409
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Get next HD index — atomic increment
    const hdIndex = await getNextHdIndex();

    // Derive deposit address
    const depositAddress = deriveDepositAddress(hdIndex);

    // Create user
    const user = await createUser({
      email,
      phone: normalizedPhone,
      password_hash: passwordHash,
      hd_index: hdIndex,
      deposit_address: depositAddress,
      kyc_status: "pending",
      language: "en",
      data_saver: false,
      auto_earn: false,
    });

    // Initialize zero balances
    await initializeUserBalances(user.uid);

    // Record referral if a valid code was supplied (fire-and-forget — never block registration)
    if (referralCode) {
      (async () => {
        try {
          const db2 = getDb();
          const { data: referrer } = await db2
            .from("users")
            .select("uid")
            .eq("referral_code", referralCode.trim().toUpperCase())
            .maybeSingle();
          if (referrer) {
            await db2.from("referrals").insert({
              referrer_uid: referrer.uid,
              referee_uid: user.uid,
              total_earned_usdt: 0,
            });
          }
        } catch (refErr) {
          console.error("[register] Referral record failed:", refErr);
        }
      })();
    }

    // Send email verification OTP — non-fatal: account is created even if email fails
    let emailSent = true;
    try {
      await sendEmailOtp(email);
    } catch (emailErr) {
      emailSent = false;
      console.error("[register] Email OTP send failed:", emailErr);
    }

    return c.json(
      {
        success: true,
        data: {
          uid: user.uid,
          message: emailSent
            ? "Account created. Check your email for a verification code."
            : "Account created. Email delivery failed — use Resend OTP to verify.",
          requiresEmailVerification: true,
        },
      },
      201
    );
  }
);

/* ─── POST /login ───────────────────────────────────────────────────────── */

auth.post(
  "/login",
  withAuthRateLimit(),
  zValidator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");

    const userRow = await findUserByEmail(email);
    if (!userRow) {
      // Constant-time response to prevent email enumeration
      await bcrypt.compare(password, "$2a$12$invalidhashpadding000000000000000");
      return c.json(
        { success: false, error: "Invalid email or password", statusCode: 401 },
        401
      );
    }

    const passwordMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordMatch) {
      return c.json(
        { success: false, error: "Invalid email or password", statusCode: 401 },
        401
      );
    }

    const token = await signJwt({ uid: userRow.uid, email: userRow.email });

    // Record login session (fire-and-forget — never block login on this)
    (async () => {
      try {
        const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const ua = c.req.header("user-agent") ?? "unknown";
        const db2 = getDb();

        // Check if this IP+UA combination has been seen before for this user
        const { data: knownSession } = await db2
          .from("login_sessions")
          .select("id")
          .eq("uid", userRow.uid)
          .eq("ip_address", ip)
          .limit(1)
          .maybeSingle();

        const isNewDevice = !knownSession;

        // Mark all previous sessions as not-current
        await db2.from("login_sessions").update({ is_current: false }).eq("uid", userRow.uid);
        await db2.from("login_sessions").insert({ uid: userRow.uid, ip_address: ip, user_agent: ua, is_current: true });
        // Keep only last 20 sessions
        const { data: sessions } = await db2.from("login_sessions").select("id").eq("uid", userRow.uid).order("created_at", { ascending: false }).limit(100);
        if (sessions && sessions.length > 20) {
          const toDelete = sessions.slice(20).map(s => s.id);
          await db2.from("login_sessions").delete().in("id", toDelete);
        }

        // Send new-device email alert
        if (isNewDevice) {
          const { Notifications } = await import("@/server/services/notifications");
          await Notifications.newDeviceLogin(userRow.uid, ip, ua);
        }
      } catch { /* non-fatal */ }
    })();

    return c.json({
      success: true,
      data: {
        user: toApiUser(userRow),
        accessToken: token,
      },
    });
  }
);

/* ─── GET /me ───────────────────────────────────────────────────────────── */

auth.get("/admin-check", authMiddleware, async (c) => {
  const user = c.get("user");
  const { isAdminUser } = await import("@/server/db/users");
  const adminStatus = await isAdminUser(user.uid);
  return c.json({ success: true, data: { isAdmin: adminStatus, role: adminStatus ? "admin" : "user" } });
});

auth.get("/me", authMiddleware, async (c) => {
  const { uid } = c.get("user");

  // Short cache (10s) to absorb React StrictMode double-invocation and rapid re-renders
  const { redis } = await import("@/lib/redis/client");
  const cacheKey = `user:me:${uid}`;
  const cached = await redis.get<ReturnType<typeof toApiUser>>(cacheKey).catch(() => null);
  if (cached != null) {
    return c.json({ success: true, data: cached });
  }

  const userRow = await findUserByUid(uid);
  if (!userRow) {
    return c.json(
      { success: false, error: "User not found", statusCode: 404 },
      404
    );
  }

  const apiUser = toApiUser(userRow);
  await redis.set(cacheKey, apiUser, { ex: 10 }).catch(() => undefined);

  return c.json({ success: true, data: apiUser });
});

/* ─── POST /logout ──────────────────────────────────────────────────────── */

auth.post("/logout", authMiddleware, async (c) => {
  // Revoke token immediately — adds to Redis blocklist so it can't be reused
  // even within the remaining 7-day expiry window
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    await revokeJwt(token).catch(() => undefined); // non-fatal if Redis is down
  }
  return c.json({ success: true, data: { message: "Logged out successfully" } });
});

/* ─── POST /otp/send ────────────────────────────────────────────────────── */

auth.post(
  "/otp/send",
  withAuthRateLimit(),
  zValidator("json", sendOtpSchema),
  async (c) => {
    const { type, identifier } = c.req.valid("json");

    const rateLimitFn = withOtpRateLimit(identifier);
    const rlResult = await rateLimitFn(c, async () => {});
    if (rlResult) return rlResult;

    if (type === "email") {
      await sendEmailOtp(identifier);
    } else {
      if (!isValidKenyanPhone(identifier)) {
        return c.json(
          { success: false, error: "Invalid Kenyan phone number", statusCode: 400 },
          400
        );
      }
      await sendPhoneOtp(identifier);
    }

    return c.json({
      success: true,
      data: { message: `Verification code sent to your ${type}` },
    });
  }
);

/* ─── POST /verify-email ────────────────────────────────────────────────── */

auth.post(
  "/verify-email",
  withAuthRateLimit(),
  zValidator("json", verifyEmailSchema),
  async (c) => {
    const { email, otp } = c.req.valid("json");

    const valid = await verifyOtp("email", email, otp);
    if (!valid) {
      return c.json(
        { success: false, error: "Invalid or expired verification code", statusCode: 400 },
        400
      );
    }

    // Find user and issue token
    const userRow = await findUserByEmail(email);
    if (!userRow) {
      return c.json(
        { success: false, error: "User not found", statusCode: 404 },
        404
      );
    }

    const token = await signJwt({ uid: userRow.uid, email: userRow.email });

    return c.json({
      success: true,
      data: {
        user: toApiUser(userRow),
        accessToken: token,
        message: "Email verified successfully",
      },
    });
  }
);

/* ─── POST /verify-phone ────────────────────────────────────────────────── */

auth.post(
  "/verify-phone",
  authMiddleware,
  withAuthRateLimit(),
  zValidator("json", verifyPhoneSchema),
  async (c) => {
    const { uid } = c.get("user");
    const { phone, otp } = c.req.valid("json");

    const normalized = normalizeKenyanPhone(phone);
    const valid = await verifyOtp("phone", normalized, otp);

    if (!valid) {
      return c.json(
        { success: false, error: "Invalid or expired verification code", statusCode: 400 },
        400
      );
    }

    const updated = await updateUser(uid, { phone: normalized });
    await invalidateUserCache(uid);

    return c.json({
      success: true,
      data: {
        user: toApiUser(updated),
        message: "Phone number verified successfully",
      },
    });
  }
);

/* ─── PATCH /password ───────────────────────────────────────────────────── */

auth.patch(
  "/password",
  authMiddleware,
  withAuthRateLimit(),
  zValidator("json", changePasswordSchema),
  async (c) => {
    const { uid } = c.get("user");
    const { currentPassword, newPassword } = c.req.valid("json");

    const userRow = await findUserByUid(uid);
    if (!userRow) {
      return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
    }

    const match = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!match) {
      return c.json(
        { success: false, error: "Current password is incorrect", statusCode: 400 },
        400
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await updateUser(uid, { password_hash: newHash });
    await invalidateUserCache(uid);

    return c.json({
      success: true,
      data: { message: "Password changed successfully" },
    });
  }
);

/* ─── POST /asset-pin ── Create or update asset PIN ─────────────────────── */

auth.post(
  "/asset-pin",
  authMiddleware,
  withAuthRateLimit(),
  zValidator("json", setAssetPinSchema),
  async (c) => {
    const { uid } = c.get("user");
    const { pin, currentPin } = c.req.valid("json");

    const userRow = await findUserByUid(uid);
    if (!userRow) {
      return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
    }

    // If PIN already set, require current PIN to change it
    if (userRow.asset_pin_hash) {
      if (!currentPin) {
        return c.json(
          { success: false, error: "Current PIN is required to set a new PIN", statusCode: 400 },
          400
        );
      }
      const match = await bcrypt.compare(currentPin, userRow.asset_pin_hash);
      if (!match) {
        return c.json(
          { success: false, error: "Current PIN is incorrect", statusCode: 400 },
          400
        );
      }
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await updateUser(uid, { asset_pin_hash: pinHash });
    await invalidateUserCache(uid);

    return c.json({
      success: true,
      data: { message: "Asset PIN set successfully" },
    });
  }
);

/* ─── POST /asset-pin/verify ── Verify asset PIN before sensitive action ── */

auth.post(
  "/asset-pin/verify",
  authMiddleware,
  zValidator("json", verifyAssetPinSchema),
  async (c) => {
    const { uid } = c.get("user");
    const { pin } = c.req.valid("json");

    const userRow = await findUserByUid(uid);
    if (!userRow) {
      return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
    }

    if (!userRow.asset_pin_hash) {
      return c.json(
        { success: false, error: "No asset PIN set. Please create one first.", statusCode: 400 },
        400
      );
    }

    const match = await bcrypt.compare(pin, userRow.asset_pin_hash);
    if (!match) {
      return c.json(
        { success: false, error: "Incorrect PIN", statusCode: 400 },
        400
      );
    }

    // Issue a short-lived pin-verified token stored in Redis
    // Frontend sends this token with sensitive requests instead of re-asking PIN
    const verificationKey = `pin_verified:${uid}:${Date.now()}`;
    const { redis } = await import("@/lib/redis/client");
    const token = Buffer.from(`${uid}:${Date.now()}`).toString("base64");
    await redis.set(`pin_token:${token}`, uid, { ex: 5 * 60 }); // 5 minute window

    return c.json({
      success: true,
      data: {
        verified: true,
        verificationToken: token,
        expiresIn: 300,
        _unused: verificationKey,
      },
    });
  }
);

/* ─── PATCH /profile ────────────────────────────────────────────────────── */

auth.patch(
  "/profile",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      displayName: z.string().min(1).max(50).optional(),
      language: z.enum(["en", "sw"]).optional(),
      dataSaver: z.boolean().optional(),
      autoEarn: z.boolean().optional(),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const body = c.req.valid("json");

    const updated = await updateUser(uid, {
      display_name: body.displayName,
      language: body.language,
      data_saver: body.dataSaver,
      auto_earn: body.autoEarn,
    });

    await invalidateUserCache(uid);
    return c.json({ success: true, data: toApiUser(updated) });
  }
);


/* ─── POST /forgot-password — send OTP to email ─────────────────────────── */

auth.post(
  "/forgot-password",
  withAuthRateLimit(),
  zValidator("json", z.object({
    email: z.string().email(),
  })),
  async (c) => {
    const { email } = c.req.valid("json");
    const db = getDb();

    // Always return success to prevent email enumeration
    const { data: user } = await db
      .from("users")
      .select("uid, email, display_name")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (user) {
      try {
        const { sendPasswordResetOtp } = await import("@/server/services/otp");
        await sendPasswordResetOtp(user.uid, user.email);
      } catch (err) {
        console.error("[forgot-password] OTP send failed:", err);
      }
    }

    return c.json({
      success: true,
      data: { message: "If an account with that email exists, a reset code has been sent." },
    });
  }
);

/* ─── POST /reset-password — verify OTP then set new password ───────────── */

auth.post(
  "/reset-password",
  withAuthRateLimit(),
  zValidator("json", z.object({
    email: z.string().email(),
    otp: z.string().length(6).regex(/^\d+$/),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
  })),
  async (c) => {
    const { email, otp, newPassword } = c.req.valid("json");
    const db = getDb();

    const { data: user } = await db
      .from("users")
      .select("uid")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (!user) {
      return c.json({ success: false, error: "Invalid or expired code.", statusCode: 400 }, 400);
    }

    const { verifyPasswordResetOtp } = await import("@/server/services/otp");
    const valid = await verifyPasswordResetOtp(user.uid, otp);
    if (!valid) {
      return c.json({ success: false, error: "Invalid or expired code.", statusCode: 400 }, 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.from("users").update({ password_hash: hashedPassword }).eq("uid", user.uid);

    // Invalidate all existing sessions by rotating the user's cache key
    await invalidateUserCache(user.uid);

    return c.json({ success: true, data: { message: "Password updated successfully. Please log in." } });
  }
);


/* ─── POST /totp/setup ── Generate TOTP secret + QR ─────────────────────── */

auth.post("/totp/setup", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const userRow = await findUserByUid(uid);
  if (!userRow) return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);

  // Generate a random 20-byte base32 secret
  const crypto = await import("crypto");
  const secret = crypto.randomBytes(20).toString("base64url").slice(0, 32).toUpperCase();

  // Store the unconfirmed secret temporarily in Redis (10 min to complete setup)
  const { redis } = await import("@/lib/redis/client");
  await redis.set(`totp_pending:${uid}`, secret, { ex: 10 * 60 });

  // Build otpauth URI for QR generation
  const issuer = "KryptoKe";
  const label = encodeURIComponent(`${issuer}:${userRow.email}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  // Generate QR code as data URL
  const QRCode = await import("qrcode");
  const qrDataUrl = await QRCode.default.toDataURL(uri, { width: 200, margin: 2 });

  return c.json({ success: true, data: { secret, qrDataUrl } });
});

/* ─── POST /totp/verify ── Confirm TOTP code and enable 2FA ─────────────── */

auth.post(
  "/totp/verify",
  authMiddleware,
  zValidator("json", z.object({ code: z.string().length(6).regex(/^\d+$/) })),
  async (c) => {
    const { uid } = c.get("user");
    const { code } = c.req.valid("json");

    const { redis } = await import("@/lib/redis/client");
    const secret = await redis.get<string>(`totp_pending:${uid}`);
    if (!secret) {
      return c.json({ success: false, error: "Setup session expired. Please start again.", statusCode: 400 }, 400);
    }

    // Validate TOTP code manually using standard TOTP algorithm (no extra lib needed)
    const crypto = await import("crypto");
    function base32Decode(s: string): Buffer {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = 0, value = 0;
      const output: number[] = [];
      for (const ch of s.replace(/=/g, "")) {
        const idx = alphabet.indexOf(ch.toUpperCase());
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; output.push((value >> bits) & 0xff); }
      }
      return Buffer.from(output);
    }
    function getTotpCode(secretB32: string, counter: number): string {
      const key = base32Decode(secretB32);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
      buf.writeUInt32BE(counter >>> 0, 4);
      const hmac = crypto.createHmac("sha1", key).update(buf).digest();
      const offset = hmac[hmac.length - 1]! & 0xf;
      const code = ((hmac[offset]! & 0x7f) << 24 | (hmac[offset+1]! & 0xff) << 16 | (hmac[offset+2]! & 0xff) << 8 | (hmac[offset+3]! & 0xff)) % 1000000;
      return code.toString().padStart(6, "0");
    }
    const counter = Math.floor(Date.now() / 30000);
    const valid = [counter - 1, counter, counter + 1].some(c2 => getTotpCode(secret, c2) === code);
    if (!valid) {
      return c.json({ success: false, error: "Invalid code. Please try again.", statusCode: 400 }, 400);
    }

    // Encrypt secret before storing (use JWT_SECRET as AES key)
    const jwtSecret = process.env.JWT_SECRET ?? "";
    const keyMaterial = crypto.createHash("sha256").update(jwtSecret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", keyMaterial, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const storedSecret = `${iv.toString("hex")}:${encrypted.toString("hex")}`;

    await updateUser(uid, { totp_secret: storedSecret, totp_enabled: true });
    await redis.del(`totp_pending:${uid}`);
    await invalidateUserCache(uid);

    return c.json({ success: true, data: { enabled: true } });
  }
);

/* ─── DELETE /totp ── Disable TOTP ──────────────────────────────────────── */

auth.delete(
  "/totp",
  authMiddleware,
  zValidator("json", z.object({ code: z.string().length(6).regex(/^\d+$/) })),
  async (c) => {
    const { uid } = c.get("user");
    const { code } = c.req.valid("json");
    const userRow = await findUserByUid(uid);
    if (!userRow?.totp_secret || !userRow.totp_enabled) {
      return c.json({ success: false, error: "2FA is not enabled", statusCode: 400 }, 400);
    }

    // Decrypt and verify the code before disabling
    const crypto = await import("crypto");
    const jwtSecret = process.env.JWT_SECRET ?? "";
    const keyMaterial = crypto.createHash("sha256").update(jwtSecret).digest();
    const [ivHex, encHex] = userRow.totp_secret.split(":");
    const iv = Buffer.from(ivHex!, "hex");
    const encrypted = Buffer.from(encHex!, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyMaterial, iv);
    const secret = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

    function base32Decode2(s: string): Buffer {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = 0, value = 0;
      const output: number[] = [];
      for (const ch of s.replace(/=/g, "")) {
        const idx = alphabet.indexOf(ch.toUpperCase());
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; output.push((value >> bits) & 0xff); }
      }
      return Buffer.from(output);
    }
    function getTotpCode2(secretB32: string, counter: number): string {
      const key = base32Decode2(secretB32);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
      buf.writeUInt32BE(counter >>> 0, 4);
      const hmac = crypto.createHmac("sha1", key).update(buf).digest();
      const offset = hmac[hmac.length - 1]! & 0xf;
      const n = ((hmac[offset]! & 0x7f) << 24 | (hmac[offset+1]! & 0xff) << 16 | (hmac[offset+2]! & 0xff) << 8 | (hmac[offset+3]! & 0xff)) % 1000000;
      return n.toString().padStart(6, "0");
    }
    const counter = Math.floor(Date.now() / 30000);
    const valid = [counter - 1, counter, counter + 1].some(c2 => getTotpCode2(secret, c2) === code);
    if (!valid) return c.json({ success: false, error: "Invalid code", statusCode: 400 }, 400);

    await updateUser(uid, { totp_secret: null, totp_enabled: false });
    await invalidateUserCache(uid);
    return c.json({ success: true, data: { enabled: false } });
  }
);

/* ─── PATCH /anti-phishing ───────────────────────────────────────────────── */

auth.patch(
  "/anti-phishing",
  authMiddleware,
  zValidator("json", z.object({
    code: z.string().min(4).max(20).regex(/^[a-zA-Z0-9_-]+$/, "Code must be alphanumeric"),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { code } = c.req.valid("json");
    await updateUser(uid, { anti_phishing_code: code });
    await invalidateUserCache(uid);
    return c.json({ success: true, data: { code } });
  }
);

/* ─── GET /sessions ─────────────────────────────────────────────────────── */

auth.get("/sessions", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const { data } = await db
    .from("login_sessions")
    .select("id, ip_address, user_agent, country, city, created_at, last_seen_at, is_current")
    .eq("uid", uid)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  return c.json({ success: true, data: data ?? [] });
});

/* ─── DELETE /sessions/:id ───────────────────────────────────────────────── */

auth.delete("/sessions/:id", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();
  // Cannot delete the current session via this endpoint
  const { data: session } = await db.from("login_sessions").select("is_current").eq("id", id).eq("uid", uid).single();
  if (session?.is_current) {
    return c.json({ success: false, error: "Cannot revoke your current session. Use logout instead.", statusCode: 400 }, 400);
  }
  await db.from("login_sessions").delete().eq("id", id).eq("uid", uid);
  return c.json({ success: true, data: { revoked: id } });
});

/* ─── POST /kyc ── Submit KYC documents ─────────────────────────────────── */

auth.post(
  "/kyc",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    docType: z.enum(["national_id", "passport", "drivers_license"]),
    frontUrl: z.string().url(),
    backUrl: z.string().url().optional(),
    selfieUrl: z.string().url(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { docType, frontUrl, backUrl, selfieUrl } = c.req.valid("json");
    const db = getDb();

    // Only allow resubmission if previous submission was rejected
    const { data: existing } = await db
      .from("kyc_submissions")
      .select("status")
      .eq("uid", uid)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .single();

    if (existing && existing.status !== "rejected") {
      const msg = existing.status === "pending"
        ? "Your KYC is under review. Please wait for the result."
        : "Identity already verified.";
      return c.json({ success: false, error: msg, statusCode: 400 }, 400);
    }

    await db.from("kyc_submissions").insert({
      uid,
      doc_type: docType,
      front_url: frontUrl,
      back_url: backUrl ?? null,
      selfie_url: selfieUrl,
    });

    await updateUser(uid, { kyc_status: "submitted" });
    await invalidateUserCache(uid);

    return c.json({ success: true, data: { status: "submitted" } }, 201);
  }
);

/* ─── GET /kyc/status ───────────────────────────────────────────────────── */

auth.get("/kyc/status", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const { data } = await db
    .from("kyc_submissions")
    .select("id, status, rejection_reason, submitted_at, reviewed_at")
    .eq("uid", uid)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .single();
  return c.json({ success: true, data: data ?? null });
});

/* ─── GET /whitelist ─────────────────────────────────────────────────────── */

auth.get("/whitelist", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const { data } = await db
    .from("withdrawal_whitelist")
    .select("*")
    .eq("uid", uid)
    .order("added_at", { ascending: false });
  return c.json({ success: true, data: data ?? [] });
});

/* ─── POST /whitelist ────────────────────────────────────────────────────── */

auth.post(
  "/whitelist",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    label: z.string().min(1).max(40),
    asset: z.string().min(1),
    chain: z.string().min(1),
    address: z.string().min(10),
    memo: z.string().optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const body = c.req.valid("json");
    const db = getDb();

    // Max 20 whitelist entries
    const { count } = await db
      .from("withdrawal_whitelist")
      .select("*", { count: "exact", head: true })
      .eq("uid", uid);
    if ((count ?? 0) >= 20) {
      return c.json({ success: false, error: "Maximum 20 whitelist addresses allowed.", statusCode: 400 }, 400);
    }

    const { data } = await db.from("withdrawal_whitelist").insert({
      uid,
      label: body.label,
      asset: body.asset,
      chain: body.chain,
      address: body.address,
      memo: body.memo ?? null,
    }).select().single();

    return c.json({ success: true, data }, 201);
  }
);

/* ─── DELETE /whitelist/:id ──────────────────────────────────────────────── */

auth.delete("/whitelist/:id", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();
  await db.from("withdrawal_whitelist").delete().eq("id", id).eq("uid", uid);
  return c.json({ success: true, data: { deleted: id } });
});

/* ─── GET /admin-check — verify caller is an admin ──────────────────────── */

auth.get("/admin-check", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const { isAdminUser } = await import("@/server/db/users");
  const isAdmin = await isAdminUser(uid);
  return c.json({ success: true, data: { isAdmin } });
});

/* ─── POST /admin-session — set httpOnly admin cookie ───────────────────── */
// Called by /admin/login after verifying the user is an admin.
// Sets a secure httpOnly cookie so Next.js edge middleware can verify it.

auth.post("/admin-session", authMiddleware, async (c) => {
  const { uid } = c.get("user");
  const { isAdminUser } = await import("@/server/db/users");
  const isAdmin = await isAdminUser(uid);

  if (!isAdmin) {
    return c.json({ success: false, error: "Not an admin", statusCode: 403 }, 403);
  }

  // Get the raw token from Authorization header to set as cookie
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return c.json({ success: false, error: "No token provided", statusCode: 400 }, 400);
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `kryptoke_admin=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=604800", // 7 days
    ...(isProd ? ["Secure"] : []),
  ].join("; ");

  return new Response(
    JSON.stringify({ success: true, data: { ok: true } }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieOptions,
      },
    }
  );
});

export default auth;
