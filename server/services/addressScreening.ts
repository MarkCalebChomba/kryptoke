/**
 * Address Screening Service — NEXUS N-B
 *
 * Layered pipeline — fastest checks first, fail-open on external errors.
 *
 * Order:
 *   1. Redis hot-cache         — instant on repeat offenders
 *   2. Internal DB blocklist   — always runs, DB-driven not hardcoded
 *   3. Layering heuristic      — same sender → 3+ accounts within 24h
 *   4. TRM Labs API            — if TRM_API_KEY is set
 *   5. Chainalysis Community   — if CHAINALYSIS_API_KEY is set
 *   6. AMLBot API              — if AMLBOT_API_KEY is set
 *
 * Any external hit auto-persists to blocked_addresses so the next check
 * is instant (DB hit, no API round-trip).
 *
 * The DB blocklist is kept current by the sync-blocklist cron job which
 * pulls from OFAC SDN XML + community GitHub lists every 24h.
 *
 * Env vars (all optional — service works without them, DB-only):
 *   CHAINALYSIS_API_KEY
 *   TRM_API_KEY
 *   AMLBOT_API_KEY
 */

import { getDb } from "@/server/db/client";
import { redis } from "@/lib/redis/client";

export interface ScreeningResult {
  blocked: boolean;
  riskLevel: "sanctions" | "high_risk" | "darknet" | "mixer" | null;
  source: string | null;
  riskScore: number;
}

const CLEAN: ScreeningResult = { blocked: false, riskLevel: null, source: null, riskScore: 0 };

function norm(address: string): string {
  return address.trim().toLowerCase();
}

function cacheKey(address: string): string {
  return `screen:v2:${norm(address).slice(0, 64)}`;
}

function categoryToRiskLevel(category: string): ScreeningResult["riskLevel"] {
  const c = category.toLowerCase();
  if (["sanction","ofac","sdn","terror","eu sanction","un sanction"].some(k => c.includes(k))) return "sanctions";
  if (["darknet","dark market","dark web","hydra","silk road","alphabay"].some(k => c.includes(k))) return "darknet";
  if (["mix","tumbl","tornado","blender","wasabi","coinjoin","peel chain"].some(k => c.includes(k))) return "mixer";
  return "high_risk";
}

async function persistHit(
  address: string, chain: string,
  riskLevel: ScreeningResult["riskLevel"], source: string, notes?: string
): Promise<void> {
  try {
    const db = getDb();
    await db.from("blocked_addresses").upsert({
      address: norm(address), chain: chain || "*",
      risk_level: riskLevel ?? "high_risk", source,
      notes: notes ?? `Auto-added via screening ${new Date().toISOString().slice(0,10)}`,
    }, { onConflict: "address,chain", ignoreDuplicates: true });
  } catch { /* non-fatal */ }
  try {
    const r: ScreeningResult = { blocked: true, riskLevel: riskLevel ?? "high_risk", source, riskScore: riskLevel === "sanctions" ? 100 : 82 };
    await redis.set(cacheKey(address), JSON.stringify(r), { ex: 900 });
  } catch { /* non-fatal */ }
}

/* ── Main entry point ─────────────────────────────────────────────────────── */

export async function checkAddress(address: string, chain: string): Promise<ScreeningResult> {
  if (!address || address.length < 10) return CLEAN;
  const n = norm(address);

  // 0. Redis hot-cache
  try {
    const cached = await redis.get<string>(cacheKey(n));
    if (cached) return JSON.parse(cached) as ScreeningResult;
  } catch { /* miss */ }

  // 1. Internal DB blocklist
  try {
    const db = getDb();
    const { data } = await db.from("blocked_addresses")
      .select("risk_level, source")
      .eq("address", n)
      .or(`chain.eq.${chain},chain.eq.*`)
      .maybeSingle();
    if (data) {
      const r: ScreeningResult = { blocked: true, riskLevel: data.risk_level as ScreeningResult["riskLevel"], source: data.source as string, riskScore: data.risk_level === "sanctions" ? 100 : 85 };
      await redis.set(cacheKey(n), JSON.stringify(r), { ex: 900 }).catch(() => {});
      return r;
    }
  } catch (err) { console.error("[Screening] DB check failed:", err); }

  // 2. Layering heuristic — same address deposited to 3+ different accounts in 24h
  try {
    const db = getDb();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await db.from("crypto_deposits")
      .select("uid").eq("from_address", n).eq("status", "completed").gte("credited_at", since);
    if (data && new Set(data.map((r: { uid: string }) => r.uid)).size >= 3) {
      await persistHit(n, chain, "high_risk", "layering_heuristic",
        "Same source address credited to 3+ accounts in 24h — suspected layering/structuring");
      return { blocked: true, riskLevel: "high_risk", source: "layering_heuristic", riskScore: 72 };
    }
  } catch { /* fail open */ }

  // 3. TRM Labs
  const trmKey = process.env.TRM_API_KEY;
  if (trmKey) {
    try {
      const res = await fetch("https://api.trmlabs.com/public/v2/screening/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${trmKey}:${trmKey}`).toString("base64")}` },
        body: JSON.stringify([{ address, chain: mapChainTrm(chain) }]),
        signal: AbortSignal.timeout(6_000),
      });
      if (res.ok) {
        const json = (await res.json()) as Array<{ addressRiskIndicators?: Array<{ categoryId: string; categoryRiskScoreLevel: string }> }>;
        const BLOCK = new Set(["HIGH","CRITICAL","SEVERE"]);
        const hit = json[0]?.addressRiskIndicators?.find(r => BLOCK.has(r.categoryRiskScoreLevel.toUpperCase()));
        if (hit) {
          const r: ScreeningResult = { blocked: true, riskLevel: categoryToRiskLevel(hit.categoryId), source: `trm:${hit.categoryId}`, riskScore: hit.categoryRiskScoreLevel.toUpperCase() === "CRITICAL" ? 95 : 80 };
          await persistHit(n, chain, r.riskLevel, r.source!);
          return r;
        }
      }
    } catch (err) { console.warn("[Screening] TRM fail-open:", err); }
  }

  // 4. Chainalysis Community
  const chaKey = process.env.CHAINALYSIS_API_KEY;
  if (chaKey) {
    try {
      const res = await fetch(`https://public.chainalysis.com/api/v1/address/${encodeURIComponent(address)}`, {
        headers: { "X-API-Key": chaKey, Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { identifications?: Array<{ category: string; name: string }> };
        const HIGH_RISK = new Set(["sanctions","darknet market","darknet service","mixer","ransomware","fraud shop","high risk exchange","theft","scam","terrorist financing","child abuse material","terrorism","cybercrime"]);
        const hit = json.identifications?.find(id => HIGH_RISK.has(id.category.toLowerCase()));
        if (hit) {
          const r: ScreeningResult = { blocked: true, riskLevel: categoryToRiskLevel(hit.category), source: `chainalysis:${hit.name}`, riskScore: 88 };
          await persistHit(n, chain, r.riskLevel, r.source!);
          return r;
        }
      }
    } catch (err) { console.warn("[Screening] Chainalysis fail-open:", err); }
  }

  // 5. AMLBot
  const amlKey = process.env.AMLBOT_API_KEY;
  if (amlKey) {
    try {
      const res = await fetch("https://amlbot.com/api/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${amlKey}` },
        body: JSON.stringify({ address }),
        signal: AbortSignal.timeout(6_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { risk?: number; signals?: string[]; isBlocked?: boolean };
        if ((json.risk ?? 0) >= 75 || json.isBlocked) {
          const signals = json.signals ?? [];
          const riskLevel = signals.some(s => s.toLowerCase().includes("sanction")) ? "sanctions"
            : signals.some(s => s.toLowerCase().includes("dark")) ? "darknet"
            : signals.some(s => s.toLowerCase().includes("mix")) ? "mixer"
            : "high_risk";
          const r: ScreeningResult = { blocked: true, riskLevel, source: `amlbot:score${json.risk ?? 75}`, riskScore: json.risk ?? 75 };
          await persistHit(n, chain, r.riskLevel, r.source!);
          return r;
        }
      }
    } catch (err) { console.warn("[Screening] AMLBot fail-open:", err); }
  }

  // Cache clean result briefly (2 min) to avoid hammering APIs on rapid rechecks
  await redis.set(cacheKey(n), JSON.stringify(CLEAN), { ex: 120 }).catch(() => {});
  return CLEAN;
}

function mapChainTrm(chain: string): string {
  const m: Record<string, string> = {
    "56": "BNB", "1": "ETH", "137": "POLYGON", "42161": "ARBITRUM",
    "10": "OPTIMISM", "8453": "BASE",
    "TRON": "TRON", "BTC": "BITCOIN", "SOL": "SOLANA",
    "XRP": "XRP", "LTC": "LITECOIN", "DOGE": "DOGECOIN",
  };
  return m[chain.toUpperCase()] ?? chain.toUpperCase();
}

/* ─── Invalidate cached result (call when admin manually blocks an address) ── */

export async function invalidateScreeningCache(address: string): Promise<void> {
  await redis.del(cacheKey(address)).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPLIANCE ALERT
   ═══════════════════════════════════════════════════════════════════════════ */

export async function raiseComplianceAlert(opts: {
  uid: string;
  alertType: "blocked_deposit" | "blocked_withdrawal" | "aml_flag";
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();
    await db.from("compliance_alerts").insert({ uid: opts.uid, alert_type: opts.alertType, severity: opts.severity, details: opts.details, status: "open" });
    const { data: configRow } = await db.from("system_config").select("value").eq("key", "admin_notification_email").maybeSingle();
    const adminEmail = (configRow?.value as string) ?? "";
    if (adminEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
        to: adminEmail,
        subject: `[KryptoKe COMPLIANCE] ${opts.alertType.toUpperCase().replace(/_/g," ")} — ${opts.severity.toUpperCase()}`,
        html: `<div style="font-family:sans-serif;max-width:520px;"><h2 style="color:#FF4444;">⚠ ${opts.alertType.replace(/_/g," ")}</h2><p><strong>Severity:</strong> ${opts.severity.toUpperCase()}</p><p><strong>UID:</strong> <code>${opts.uid}</code></p><pre style="background:#111;color:#fff;padding:12px;border-radius:8px;font-size:11px;">${JSON.stringify(opts.details, null, 2)}</pre><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin" style="background:#F0B429;color:#080C14;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review in Admin</a></p></div>`,
      }).catch(console.error);
    }
  } catch (err) { console.error("[ComplianceAlert]", err); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BLOCKLIST SYNC — called by /api/v1/cron/sync-blocklist
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SyncStats {
  ofac: number;
  githubLists: number;
  total: number;
  errors: string[];
}

export async function syncBlocklist(): Promise<SyncStats> {
  const stats: SyncStats = { ofac: 0, githubLists: 0, total: 0, errors: [] };
  await Promise.allSettled([syncOfacSdn(stats), syncGithubLists(stats)]);
  stats.total = stats.ofac + stats.githubLists;
  console.log(`[BlocklistSync] Complete: ${stats.total} addresses processed. Errors: ${stats.errors.length}`);
  return stats;
}

/* ─── OFAC SDN XML ────────────────────────────────────────────────────────── */

async function syncOfacSdn(stats: SyncStats): Promise<void> {
  const urls = [
    "https://sanctionslist.ofac.treas.gov/Home/SdnList?fileType=XML",
    "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml",
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const xml = await res.text();

      // Parse <digitalCurrencyAddress type="ETH">0x...</digitalCurrencyAddress>
      const re = /<digitalCurrencyAddress[^>]*type="([^"]*)"[^>]*>([^<]+)<\/digitalCurrencyAddress>/gi;
      const rows: Array<{ address: string; chain: string; risk_level: string; source: string; notes: string }> = [];
      let m;
      while ((m = re.exec(xml)) !== null) {
        const addr = m[2]!.trim().toLowerCase();
        if (addr.length < 10) continue;
        rows.push({ address: addr, chain: mapOfacCoin(m[1] ?? ""), risk_level: "sanctions", source: "ofac_sdn", notes: `OFAC SDN synced ${new Date().toISOString().slice(0,10)}` });
      }

      if (!rows.length) continue;

      const db = getDb();
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from("blocked_addresses").upsert(rows.slice(i, i + 200), { onConflict: "address,chain", ignoreDuplicates: true });
        if (!error) stats.ofac += Math.min(200, rows.length - i);
      }
      console.log(`[BlocklistSync] OFAC: ${stats.ofac} from ${url}`);
      return; // success — don't try next URL
    } catch (err) {
      stats.errors.push(`ofac(${url}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function mapOfacCoin(type: string): string {
  const m: Record<string, string> = {
    ETH:"*", XBT:"BTC", LTC:"LTC", BCH:"BCH", XMR:"XMR",
    DASH:"DASH", ZEC:"ZEC", TRX:"TRON", USDT:"*", USDC:"*",
    SOL:"SOL", XRP:"XRP", DOGE:"DOGE", ADA:"ADA", DOT:"DOT",
  };
  return m[type.toUpperCase()] ?? "*";
}

/* ─── Community-maintained GitHub sanction lists ──────────────────────────── */

const GITHUB_LISTS = [
  { url: "https://raw.githubusercontent.com/ultrasoundmoney/eth-analysis-rs/main/sanctioned-addresses/sanctioned_addresses_ETH.json", riskLevel: "sanctions" as const, source: "eth_community_sanctions" },
  { url: "https://raw.githubusercontent.com/nicehash/NiceHashQuickMiner/master/optimize/nicehash_blocked_addresses.json", riskLevel: "mixer" as const, source: "nicehash_mixer_list" },
];

async function syncGithubLists(stats: SyncStats): Promise<void> {
  const db = getDb();
  for (const list of GITHUB_LISTS) {
    try {
      const res = await fetch(list.url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const text = await res.text();
      let addresses: string[] = [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          addresses = parsed.map((v: unknown) => typeof v === "string" ? v : (v as Record<string,string>).address ?? "").filter(a => a.length >= 10);
        }
      } catch {
        addresses = text.split("\n").map(l => l.trim().toLowerCase()).filter(l => (l.startsWith("0x") || l.startsWith("T") || l.startsWith("1") || l.startsWith("3") || l.startsWith("bc1")) && l.length >= 10);
      }

      if (!addresses.length) continue;

      const rows = addresses.map(a => ({ address: norm(a), chain: "*", risk_level: list.riskLevel, source: list.source, notes: `Synced ${new Date().toISOString().slice(0,10)}` }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from("blocked_addresses").upsert(rows.slice(i, i + 200), { onConflict: "address,chain", ignoreDuplicates: true });
        if (!error) stats.githubLists += Math.min(200, rows.length - i);
      }
      console.log(`[BlocklistSync] ${list.source}: ${rows.length} addresses`);
    } catch (err) {
      stats.errors.push(`${list.source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
