import Big from "big.js";

// Configure Big.js globally
Big.RM = Big.roundDown; // Always round down for safety (no user gets more than they should)
Big.DP = 18; // 18 decimal places internally

/* ─── Safe Constructors ─────────────────────────────────────────────────── */

/**
 * Parse a value to Big safely. Returns Big(0) on invalid input.
 */
export function toBig(value: string | number | Big | null | undefined): Big {
  if (value === null || value === undefined || value === "") return new Big(0);
  try {
    return new Big(value);
  } catch {
    return new Big(0);
  }
}

/**
 * Returns true if the value is a valid, non-negative number.
 */
export function isValidAmount(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false;
  try {
    const b = new Big(value);
    return b.gte(0);
  } catch {
    return false;
  }
}

/* ─── Arithmetic ────────────────────────────────────────────────────────── */

export function add(a: string | number, b: string | number): string {
  return toBig(a).plus(toBig(b)).toFixed();
}

export function subtract(a: string | number, b: string | number): string {
  return toBig(a).minus(toBig(b)).toFixed();
}

export function multiply(a: string | number, b: string | number): string {
  return toBig(a).times(toBig(b)).toFixed();
}

export function divide(a: string | number, b: string | number): string {
  const divisor = toBig(b);
  if (divisor.eq(0)) return "0";
  return toBig(a).div(divisor).toFixed();
}

/* ─── Comparison ────────────────────────────────────────────────────────── */

export function gt(a: string | number, b: string | number): boolean {
  return toBig(a).gt(toBig(b));
}

export function gte(a: string | number, b: string | number): boolean {
  return toBig(a).gte(toBig(b));
}

export function lt(a: string | number, b: string | number): boolean {
  return toBig(a).lt(toBig(b));
}

export function lte(a: string | number, b: string | number): boolean {
  return toBig(a).lte(toBig(b));
}

export function eq(a: string | number, b: string | number): boolean {
  return toBig(a).eq(toBig(b));
}

export function isZero(value: string | number): boolean {
  return toBig(value).eq(0);
}

export function isPositive(value: string | number): boolean {
  return toBig(value).gt(0);
}

export function isNegative(value: string | number): boolean {
  return toBig(value).lt(0);
}

/* ─── Rounding ──────────────────────────────────────────────────────────── */

export function toFixed(value: string | number, decimals: number): string {
  return toBig(value).toFixed(decimals);
}

export function roundDown(value: string | number, decimals: number): string {
  return toBig(value).toFixed(decimals, Big.roundDown);
}

export function roundUp(value: string | number, decimals: number): string {
  return toBig(value).toFixed(decimals, Big.roundUp);
}

/* ─── Fee Calculations ──────────────────────────────────────────────────── */

/**
 * Calculate withdrawal fee. Returns fee and net amount.
 * feePercent is a decimal string e.g. "0.01" for 1%
 */
export function calculateWithdrawalFee(
  amount: string,
  feePercent: string
): { fee: string; netAmount: string } {
  const a = toBig(amount);
  const fee = a.times(toBig(feePercent)).toFixed(2, Big.roundUp);
  const netAmount = a.minus(toBig(fee)).toFixed(2, Big.roundDown);
  return { fee, netAmount };
}

/**
 * Calculate trading fee from spread. Returns fee amount.
 * spreadPercent is a decimal string e.g. "0.002" for 0.2%
 */
export function calculateTradingFee(
  amount: string,
  spreadPercent: string
): string {
  return toBig(amount).times(toBig(spreadPercent)).toFixed(6, Big.roundUp);
}

/* ─── Conversions ───────────────────────────────────────────────────────── */

/**
 * Convert USDT to KES
 */
export function usdtToKes(usdt: string, kesPerUsd: string): string {
  return toBig(usdt).times(toBig(kesPerUsd)).toFixed(2, Big.roundDown);
}

/**
 * Convert KES to USDT
 */
export function kesToUsdt(kes: string, kesPerUsd: string): string {
  const rate = toBig(kesPerUsd);
  if (rate.eq(0)) return "0";
  return toBig(kes).div(rate).toFixed(6, Big.roundDown);
}

/**
 * Convert USDT to USD (1:1 for USDT)
 */
export function usdtToUsd(usdt: string): string {
  return toBig(usdt).toFixed(2, Big.roundDown);
}

/**
 * Calculate total portfolio value in KES
 */
export function portfolioValueKes(
  kesBalance: string,
  usdtBalance: string,
  kesPerUsd: string
): string {
  const kesFromUsdt = usdtToKes(usdtBalance, kesPerUsd);
  return add(kesBalance, kesFromUsdt);
}

/* ─── Percentage ────────────────────────────────────────────────────────── */

/**
 * Calculate percentage change between two values.
 * Returns a signed string like "5.23" or "-3.14"
 */
export function percentageChange(from: string, to: string): string {
  const fromBig = toBig(from);
  if (fromBig.eq(0)) return "0";
  return toBig(to)
    .minus(fromBig)
    .div(fromBig)
    .times(100)
    .toFixed(2, Big.roundDown);
}

/**
 * Calculate X% of a value
 */
export function percentageOf(value: string, percent: number): string {
  return toBig(value)
    .times(percent)
    .div(100)
    .toFixed(8, Big.roundDown);
}

/* ─── Earn Calculations ──────────────────────────────────────────────────── */

/**
 * Calculate estimated earn returns
 */
export function calculateEarnEstimates(
  principal: string,
  aprPercent: string
): { daily: string; monthly: string; yearly: string } {
  const p = toBig(principal);
  const apr = toBig(aprPercent).div(100);

  const daily = p.times(apr).div(365).toFixed(6, Big.roundDown);
  const monthly = p.times(apr).div(12).toFixed(6, Big.roundDown);
  const yearly = p.times(apr).toFixed(6, Big.roundDown);

  return { daily, monthly, yearly };
}

/* ─── Validation ────────────────────────────────────────────────────────── */

export function validateAmount(
  amount: string,
  min: string,
  max: string,
  available: string
): { valid: boolean; error: string | null } {
  if (!isValidAmount(amount)) {
    return { valid: false, error: "Please enter a valid amount" };
  }
  if (lte(amount, "0")) {
    return { valid: false, error: "Amount must be greater than 0" };
  }
  if (lt(amount, min)) {
    return { valid: false, error: `Minimum amount is ${min}` };
  }
  if (gt(amount, max)) {
    return { valid: false, error: `Maximum amount is ${max}` };
  }
  if (gt(amount, available)) {
    return { valid: false, error: "Insufficient balance" };
  }
  return { valid: true, error: null };
}
