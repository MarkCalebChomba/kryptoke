/**
 * Config Routes — public, no auth required
 *
 * GET /api/v1/config/payment-methods?country=KE
 *   Returns active payment providers for the given country.
 *   Used by the deposit page to show/hide payment methods.
 *
 * GET /api/v1/config/countries
 *   Returns the list of supported countries (any country that has ≥1 provider).
 */

import { Hono } from "hono";
import {
  PAYMENT_PROVIDERS,
  getActiveProvidersForCountry,
} from "@/server/services/paymentProviders";

const config = new Hono();

/* ─── GET /payment-methods ───────────────────────────────────────────────── */

config.get("/payment-methods", (c) => {
  const country = (c.req.query("country") ?? "KE").toUpperCase().trim();

  const providers = getActiveProvidersForCountry(country);

  // Shape the response — strip internal fields the UI doesn't need
  const data = providers.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    currencies: p.currencies,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    feePercent: p.feePercent,
    flatFee: p.flatFee,
    processingTime: p.processingTime,
    logoUrl: p.logoUrl ?? null,
  }));

  // If no active providers, tell the UI to fall back to crypto-only messaging
  return c.json({
    success: true,
    data: {
      country,
      providers: data,
      hasActiveProviders: data.length > 0,
      fallbackMessage:
        data.length === 0
          ? "Card and mobile money payments are coming soon for your region. Deposit via crypto in the meantime."
          : null,
    },
  });
});

/* ─── GET /countries ─────────────────────────────────────────────────────── */

config.get("/countries", (c) => {
  // Return every country that has at least one provider (active or not) — useful
  // for the country selector dropdown on the register page.
  const seen = new Set<string>();
  const countries: Array<{ code: string; hasActiveProvider: boolean }> = [];

  for (const p of PAYMENT_PROVIDERS) {
    for (const code of p.countries) {
      if (code === "*") continue;
      if (!seen.has(code)) {
        seen.add(code);
        countries.push({
          code,
          hasActiveProvider: PAYMENT_PROVIDERS.some(
            (pp) => pp.active && (pp.countries.includes(code) || pp.countries.includes("*"))
          ),
        });
      }
    }
  }

  return c.json({ success: true, data: countries });
});

export default config;
