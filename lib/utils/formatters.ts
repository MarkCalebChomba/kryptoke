import { toBig, gt, gte } from "./money";

/* ─── Price Formatting ──────────────────────────────────────────────────── */

/**
 * Format a price for display. Uses DM Mono font in components.
 * Auto-selects decimal places based on magnitude.
 */
export function formatPrice(
  value: string | number,
  options?: { currency?: string; compact?: boolean }
): string {
  const { currency, compact = false } = options ?? {};
  const n = parseFloat(String(value));

  if (isNaN(n)) return "0.00";

  let formatted: string;

  if (compact && n >= 1_000_000) {
    formatted = (n / 1_000_000).toFixed(2) + "M";
  } else if (compact && n >= 1_000) {
    formatted = (n / 1_000).toFixed(2) + "K";
  } else if (n >= 10_000) {
    formatted = n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (n >= 1) {
    formatted = n.toFixed(2);
  } else if (n >= 0.01) {
    formatted = n.toFixed(4);
  } else if (n >= 0.0001) {
    formatted = n.toFixed(6);
  } else {
    formatted = n.toFixed(8);
  }

  return currency ? `${currency} ${formatted}` : formatted;
}

/**
 * Format KES amount — always 2 decimal places, comma thousands separator.
 */
export function formatKes(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "KSh 0.00";
  return "KSh " + n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format USDT amount — 2 or 6 decimal places.
 */
export function formatUsdt(value: string | number, decimals = 2): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "0.00 USDT";
  return n.toFixed(decimals) + " USDT";
}

/**
 * Format a percentage change. Returns e.g. "+5.23%" or "-3.14%"
 * Includes sign prefix.
 */
export function formatChange(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "0.00%";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * Returns "up" | "down" | "flat" based on a change value.
 * Used for coloring in price/change cells.
 */
export function priceDirection(value: string | number): "up" | "down" | "flat" {
  const n = parseFloat(String(value));
  if (isNaN(n) || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}

/**
 * Format volume with compact notation.
 */
export function formatVolume(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

/**
 * Format an APR percentage. e.g. "10.50%"
 */
export function formatApr(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "0.00%";
  return n.toFixed(2) + "%";
}

/* ─── Date & Time Formatting ────────────────────────────────────────────── */

/**
 * Format a date string to a human-readable relative time.
 * e.g. "2 mins ago", "3 hours ago", "Yesterday", "Mar 15"
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

/**
 * Format a date for display in event calendar.
 * e.g. "Mar 15, 2025 at 14:00"
 */
export function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " at " + date.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format a date for transaction history.
 * e.g. "15 Mar 2025, 14:32"
 */
export function formatTxDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + ", " + date.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format YYYY-MM-DD date for PnL calendar.
 */
export function formatCalendarDate(dateString: string): {
  day: number;
  month: string;
  year: number;
} {
  const [yearStr, monthStr, dayStr] = dateString.split("-");
  const date = new Date(
    parseInt(yearStr ?? "2025"),
    parseInt(monthStr ?? "1") - 1,
    parseInt(dayStr ?? "1")
  );
  return {
    day: date.getDate(),
    month: date.toLocaleDateString("en-KE", { month: "short" }),
    year: date.getFullYear(),
  };
}

/* ─── Phone Number Formatting ────────────────────────────────────────────── */

/**
 * Normalize Kenyan phone number to 254XXXXXXXXX format.
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX
 */
export function normalizeKenyanPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");

  if (cleaned.startsWith("+254")) return "254" + cleaned.slice(4);
  if (cleaned.startsWith("254")) return cleaned;
  if (cleaned.startsWith("0"))   return "254" + cleaned.slice(1);
  return cleaned;
}

/**
 * Validate a Kenyan phone number.
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, 2541XXXXXXXX, +2547XXXXXXXX, +2541XXXXXXXX
 */
export function isValidKenyanPhone(phone: string): boolean {
  const normalized = normalizeKenyanPhone(phone);
  // 254 + (7 or 1) + 8 digits  →  Safaricom (07x), Airtel (01x)
  return /^254[71]\d{8}$/.test(normalized);
}

/**
 * Display phone number in masked format for UI.
 * e.g. "0712 *** 456"
 */
export function maskPhone(phone: string): string {
  const normalized = normalizeKenyanPhone(phone);
  if (normalized.length < 10) return phone;
  const local = "0" + normalized.slice(3);
  return local.slice(0, 4) + " *** " + local.slice(-3);
}

/* ─── Address Formatting ─────────────────────────────────────────────────── */

/**
 * Truncate a blockchain address for display.
 * e.g. "0x1234...5678"
 */
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Validate a BNB/ETH-compatible address (basic check).
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/* ─── Misc UI Helpers ────────────────────────────────────────────────────── */

/**
 * Get user initials from name or email.
 */
export function getUserInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    }
    return (name[0] ?? "").toUpperCase();
  }
  return (email[0] ?? "").toUpperCase();
}

/**
 * Generate consistent color from a string (for avatar backgrounds, token icons fallback).
 */
export function stringToColor(str: string): string {
  const colors = [
    "#00E5B4", "#F0B429", "#00D68F", "#FF4560",
    "#4A90E2", "#7B68EE", "#FF8C00", "#20B2AA",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? "#00E5B4";
}

/**
 * Format a number input as the user types — removes leading zeros, limits decimals.
 */
export function sanitizeNumberInput(value: string, maxDecimals = 8): string {
  // Remove all non-numeric chars except decimal point
  let sanitized = value.replace(/[^0-9.]/g, "");

  // Only allow one decimal point
  const parts = sanitized.split(".");
  if (parts.length > 2) {
    sanitized = (parts[0] ?? "") + "." + parts.slice(1).join("");
  }

  // Limit decimal places
  if (parts[1] !== undefined && parts[1].length > maxDecimals) {
    sanitized = (parts[0] ?? "") + "." + parts[1].slice(0, maxDecimals);
  }

  // Remove leading zeros (except "0.")
  if (sanitized.length > 1 && sanitized[0] === "0" && sanitized[1] !== ".") {
    sanitized = sanitized.replace(/^0+/, "");
  }

  return sanitized;
}
