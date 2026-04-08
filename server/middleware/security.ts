import type { Context, Next } from "hono";

const MAX_BODY_SIZE_BYTES = 1024 * 64; // 64KB max request body

/**
 * Enforces maximum request body size.
 * Rejects oversized payloads before they reach route handlers.
 */
export async function bodySizeLimit(c: Context, next: Next): Promise<Response | void> {
  const contentLength = parseInt(c.req.header("content-length") ?? "0");
  if (contentLength > MAX_BODY_SIZE_BYTES) {
    return c.json(
      { success: false, error: "Request body too large", statusCode: 413 },
      413
    );
  }
  await next();
}

/**
 * Detects and blocks common injection attack patterns in the URL path and query string.
 * NOTE: We only check the URL — NOT the body. Checking the body with hono/vercel
 * on Next.js App Router consumes the stream and causes "Malformed JSON" errors downstream.
 */
export async function injectionGuard(c: Context, next: Next): Promise<Response | void> {
  const url = c.req.url;
  const path = new URL(url).pathname;

  // Skip injection checks for M-Pesa callbacks — Safaricom sends raw phone numbers
  // and transaction IDs that can trigger false positives. The Safaricom IP guard handles security there.
  if (path.includes("/mpesa/") || path.includes("/b2c/")) {
    await next();
    return;
  }

  // URL-level injection patterns — covers SQL injection, XSS, path traversal, and command injection
  const URL_ATTACK_PATTERNS = [
    // SQL injection
    /(\'|\%27|\%2527|--|;|\bUNION\b.*\bSELECT\b|\bDROP\b.*\bTABLE\b|\bINSERT\b.*\bINTO\b|\bDELETE\b.*\bFROM\b|\bUPDATE\b.*\bSET\b|\bEXEC\b|\bEXECUTE\b)/i,
    // XSS
    /(\%3C|<[^>]*>|javascript:|vbscript:|data:[^,]*,|on\w+=)/i,
    // Path traversal
    /(\.\.\/)|(\.\.\\)|(\%2e\%2e)|(\%252e)/i,
    // Template injection
    /(\{\{|\}\}|\$\{|<%=|<%)/,
    // Command injection (& excluded — it's a valid URL query string separator)
    /([;|`$]|\|\||>>|<<)/,
    // LDAP / NoSQL injection
    /(\(uid=|\(objectclass=|\$where|\$gt|\$lt|\$ne|\$regex|\$or|\$and)/i,
  ];

  for (const pattern of URL_ATTACK_PATTERNS) {
    // Only check the URL path and query string — not the body
    const urlToCheck = url.split("?")[0] ?? "";
    const queryToCheck = url.includes("?") ? url.split("?")[1] ?? "" : "";

    if (pattern.test(urlToCheck) || pattern.test(decodeURIComponent(queryToCheck))) {
      import("@sentry/nextjs").then(({ captureMessage }) => {
        captureMessage(`Injection attempt detected: ${url}`, {
          level: "error",
          extra: {
            pattern: pattern.toString(),
            url,
            ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown",
          },
        });
      }).catch(() => undefined);

      // Return generic error — never reveal the detection mechanism
      return c.json({ success: false, error: "Bad request", statusCode: 400 }, 400);
    }
  }

  await next();
}

/**
 * Adds comprehensive security response headers to all API responses.
 * Prevents clickjacking, MIME sniffing, info leakage, and enforces HTTPS.
 */
export async function apiSecurityHeaders(c: Context, next: Next): Promise<void> {
  await next();
  // Prevent MIME-type sniffing attacks
  c.header("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");
  // Disable caching of sensitive API responses
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  // Force HTTPS for 1 year (only in production)
  if (process.env.NODE_ENV === "production") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  // Block reflected XSS (legacy but still useful for older browsers)
  c.header("X-XSS-Protection", "1; mode=block");
  // Limit referrer information leakage
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Restrict browser features (payments, camera, location etc.)
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Remove server identity header
  c.header("Server", "");
  // Prevent content type sniffing
  c.header("X-Download-Options", "noopen");
  // Content Security Policy for API responses
  c.header("Content-Security-Policy", "default-src \'none\'; frame-ancestors \'none\'");
}

/**
 * Validates Safaricom callback requests are from Safaricom IP ranges.
 * Production only — prevents callback spoofing.
 */
const SAFARICOM_IP_RANGES = [
  "196.201.214.200", "196.201.214.206", "196.201.213.114",
  "196.201.214.207", "196.201.214.208", "196.201.213.44",
  "196.201.212.127", "196.201.212.138", "196.201.212.129",
  "196.201.212.136", "196.201.212.74",  "196.201.212.69",
];

export async function safaricomIpGuard(c: Context, next: Next): Promise<Response | void> {
  // Sandbox mode: allow all IPs — Safaricom sandbox callbacks originate from non-production IPs
  const isSandbox = process.env.MPESA_ENVIRONMENT !== "production";
  if (isSandbox) {
    await next();
    return;
  }

  // Production: enforce Safaricom IP allowlist
  const xForwardedFor = c.req.header("x-forwarded-for") ?? "";
  const clientIp =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-real-ip") ??
    xForwardedFor.split(",")[0]?.trim() ??
    "";

  console.log(`[safaricomIpGuard] callback from IP: ${clientIp}`);

  if (!SAFARICOM_IP_RANGES.includes(clientIp)) {
    console.warn(`[safaricomIpGuard] BLOCKED callback from non-Safaricom IP: ${clientIp}`);
    // Return 200 to Safaricom so they don't retry — but don't process
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  await next();
}
