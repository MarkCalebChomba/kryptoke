import { redis, CacheKeys } from "@/lib/redis/client";
import { normalizeKenyanPhone } from "@/lib/utils/formatters";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_LENGTH = 6;

/* ─── Generate ──────────────────────────────────────────────────────────── */

function generateOtp(): string {
  // Use crypto.randomInt for cryptographically secure OTPs
  const { randomInt } = require("crypto") as { randomInt: (min: number, max: number) => number };
  return String(randomInt(100000, 999999)); // guaranteed 6 digits
}

function otpKey(type: "phone" | "email", identifier: string): string {
  return `otp:${type}:${identifier.toLowerCase()}`;
}

/* ─── Store ─────────────────────────────────────────────────────────────── */

export async function storeOtp(
  type: "phone" | "email",
  identifier: string
): Promise<string> {
  const otp = generateOtp();
  const key = otpKey(type, identifier);
  await redis.set(key, otp, { ex: OTP_TTL_SECONDS });
  return otp;
}

/* ─── Verify ────────────────────────────────────────────────────────────── */

export async function verifyOtp(
  type: "phone" | "email",
  identifier: string,
  otp: string
): Promise<boolean> {
  const key = otpKey(type, identifier);
  // Upstash automaticDeserialization is on by default: numeric strings are
  // returned as JS numbers (JSON.parse("123456") = 123456). Coerce to string.
  const raw = await redis.get<string | number>(key);
  if (raw == null) return false;
  const stored = String(raw);
  if (stored !== otp.trim()) return false;
  // Delete after successful verification — one-time use
  await redis.del(key);
  return true;
}

/* ─── Send via Africa's Talking ─────────────────────────────────────────── */

export async function sendPhoneOtp(phone: string): Promise<void> {
  const normalized = normalizeKenyanPhone(phone);
  const otp = await storeOtp("phone", normalized);

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;

  if (!username || !apiKey) {
    throw new Error("Africa's Talking credentials not configured");
  }

  // Africa's Talking SDK init
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AfricasTalking = require("africastalking") as (opts: {
    username: string;
    apiKey: string;
  }) => { SMS: { send: (opts: object) => Promise<{ SMSMessageData?: { Recipients?: Array<{ statusCode: number; status: string; number: string }> } }> } };

  const at = AfricasTalking({ username, apiKey });

  const message = `Your KryptoKe verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;

  // In live mode:
  // - phone number must include country code with + prefix: +254XXXXXXXXX
  // - from/sender_id is optional; if set it must be registered with AT
  // - if sender ID not approved yet, omit it (AT will use a short code)
  const sendOptions: Record<string, unknown> = {
    to: [`+${normalized}`],
    message,
  };

  // Only add sender ID if explicitly configured and not using sandbox
  // Sandbox ignores sender ID; live mode requires it to be pre-approved by AT
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  const isSandbox = username === "sandbox";

  if (senderId && !isSandbox) {
    sendOptions.from = senderId;
  }

  const result = await at.SMS.send(sendOptions);

  // Check for delivery failures
  const recipients = result?.SMSMessageData?.Recipients ?? [];
  const failed = recipients.filter((r) => r.statusCode !== 101);
  if (failed.length > 0 && recipients.length > 0) {
    const reason = failed[0]?.status ?? "Unknown error";
    console.error("[OTP] Africa's Talking delivery failed:", reason);
    // Don't throw — OTP is stored in Redis. User can request resend.
    // Throwing here would delete the stored OTP and confuse the user.
  }
}

/* ─── Send via Resend Email ─────────────────────────────────────────────── */

export async function sendEmailOtp(email: string): Promise<void> {
  const otp = await storeOtp("email", email);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: email,
    subject: "Your KryptoKe verification code",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #080C14; color: #F0F4FF; border-radius: 16px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 800; color: #00E5B4;">KryptoKe</span>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #F0F4FF;">Verify your email address</h2>
        <p style="color: #8A9CC0; margin-bottom: 24px; font-size: 15px;">Enter the code below to confirm your email and activate your account.</p>
        <div style="background: #0E1420; border: 1px solid #1C2840; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 36px; font-weight: 500; letter-spacing: 8px; color: #00E5B4;">${otp}</span>
        </div>
        <p style="color: #4A5B7A; font-size: 13px;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    console.error("[OTP] Resend email failed:", error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
/* ─── Password Reset OTP ─────────────────────────────────────────────────── */

/**
 * Send a password reset OTP to the user's registered email.
 * Stores under key otp:password_reset:{uid} to prevent collision with
 * email verification OTPs.
 */
export async function sendPasswordResetOtp(uid: string, email: string): Promise<void> {
  const otp = generateOtp();
  await redis.set(`otp:password_reset:${uid}`, otp, { ex: OTP_TTL_SECONDS });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
    to: email,
    subject: "Reset your KryptoKe password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#080C14;color:#F0F4FF;border-radius:16px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:24px;font-weight:800;color:#00E5B4;">KryptoKe</span>
        </div>
        <h2 style="font-size:20px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Reset your password</h2>
        <p style="color:#8A9CC0;margin-bottom:24px;font-size:15px;">Enter the code below to set a new password. This code is valid for 10 minutes.</p>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-family:monospace;font-size:36px;font-weight:500;letter-spacing:8px;color:#F0B429;">${otp}</span>
        </div>
        <p style="color:#4A5B7A;font-size:13px;">If you did not request a password reset, ignore this email. Your password has not changed.</p>
      </div>
    `,
  });
}

/**
 * Verify a password reset OTP for a given uid.
 */
export async function verifyPasswordResetOtp(uid: string, otp: string): Promise<boolean> {
  const key = `otp:password_reset:${uid}`;
  const raw = await redis.get<string | number>(key);
  if (raw == null) return false;
  if (String(raw) !== otp.trim()) return false;
  await redis.del(key);
  return true;
}
