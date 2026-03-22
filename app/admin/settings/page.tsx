"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface SystemConfig {
  paybill_number: string;
  deposit_fee_percent: string;
  withdrawal_fee_percent: string;
  trading_spread_percent: string;
  daily_withdrawal_limit_kes: string;
  min_deposit_kes: string;
  min_withdrawal_kes: string;
  maintenance_mode: string;
  mpesa_display_name: string;
  futures_fee_per_trade: string;
  futures_spread_percent: string;
  futures_max_leverage: string;
}

interface ExchangeKey {
  id: string;
  exchange: "okx" | "binance" | "bybit";
  label: string;
  is_active: boolean;
  is_testnet: boolean;
  priority: number;
  last_used_at: string | null;
  error_count: number;
  created_at: string;
}

/* ─── Config Field ──────────────────────────────────────────────────────── */

function ConfigField({ label, description, value, onChange, type = "text", prefix, suffix }: {
  label: string; description: string; value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "toggle"; prefix?: string; suffix?: string;
}) {
  if (type === "toggle") {
    const isOn = value === "true";
    return (
      <div className="flex items-start justify-between py-3.5 border-b border-border/50">
        <div className="flex-1 mr-4">
          <p className="font-outfit text-sm font-medium text-text-primary">{label}</p>
          <p className="font-outfit text-xs text-text-muted mt-0.5">{description}</p>
        </div>
        <button onClick={() => onChange(isOn ? "false" : "true")}
          className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0", isOn ? "bg-down" : "bg-border-2")}
          aria-label={label}>
          <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", isOn ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>
    );
  }
  return (
    <div className="py-3.5 border-b border-border/50">
      <label className="block font-outfit text-sm font-medium text-text-primary mb-0.5">{label}</label>
      <p className="font-outfit text-xs text-text-muted mb-2">{description}</p>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 font-outfit text-sm text-text-muted">{prefix}</span>}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
          className={cn("w-full bg-bg-surface2 border border-border rounded-xl py-2.5 font-price text-sm text-text-primary outline-none focus:border-primary",
            prefix ? "pl-10 pr-4" : "px-4", suffix ? "pr-14" : "")} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 font-outfit text-xs text-text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

/* ─── Exchange Key Row ──────────────────────────────────────────────────── */

const EXCHANGE_COLORS = { okx: "text-yellow-400", binance: "text-yellow-300", bybit: "text-orange-400" };
const EXCHANGE_LABELS = { okx: "OKX", binance: "Binance", bybit: "Bybit" };
const PRIORITY_LABELS = ["—", "Primary", "Fallback 1", "Fallback 2", "Fallback 3"];

function ExchangeKeyRow({ k, onEdit, onDelete, onToggle }: {
  k: ExchangeKey;
  onEdit: (k: ExchangeKey) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  return (
    <div className={cn("px-4 py-3 flex items-center gap-3 border-b border-border/40", !k.is_active && "opacity-50")}>
      {/* Exchange badge */}
      <div className="w-10 h-10 rounded-xl bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
        <span className={cn("font-price text-[10px] font-bold", EXCHANGE_COLORS[k.exchange])}>
          {EXCHANGE_LABELS[k.exchange]}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-outfit text-sm font-semibold text-text-primary">{k.label || EXCHANGE_LABELS[k.exchange]}</span>
          {k.is_testnet && (
            <span className="font-outfit text-[9px] font-bold bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded">TESTNET</span>
          )}
          <span className="font-outfit text-[9px] text-text-muted bg-bg-surface2 px-1.5 py-0.5 rounded">
            {PRIORITY_LABELS[k.priority] ?? `Priority ${k.priority}`}
          </span>
        </div>
        <p className="font-outfit text-[10px] text-text-muted mt-0.5">
          {k.error_count > 0 && <span className="text-down mr-2">{k.error_count} errors</span>}
          {k.last_used_at
            ? `Last used ${new Date(k.last_used_at).toLocaleDateString("en-KE", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}`
            : "Never used"}
        </p>
      </div>

      {/* Active toggle */}
      <button onClick={() => onToggle(k.id, !k.is_active)}
        className={cn("relative w-10 h-5 rounded-full transition-colors flex-shrink-0", k.is_active ? "bg-up" : "bg-border-2")}>
        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", k.is_active ? "translate-x-5" : "translate-x-0.5")} />
      </button>

      {/* Edit + Delete */}
      <button onClick={() => onEdit(k)} className="font-outfit text-xs text-primary px-2 py-1 rounded-lg border border-primary/30">Edit</button>
      <button onClick={() => onDelete(k.id)} className="font-outfit text-xs text-down px-2 py-1 rounded-lg border border-down/30">Del</button>
    </div>
  );
}

/* ─── Add/Edit Key Form ─────────────────────────────────────────────────── */

function KeyFormSheet({ editing, onClose, onSave }: {
  editing: ExchangeKey | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [exchange,   setExchange]   = useState<"okx"|"binance"|"bybit">(editing?.exchange ?? "okx");
  const [label,      setLabel]      = useState(editing?.label ?? "");
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [priority,   setPriority]   = useState(editing?.priority ?? 1);
  const [testnet,    setTestnet]    = useState(editing?.is_testnet ?? false);

  const isOkx = exchange === "okx";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-bg-surface border-t border-border rounded-t-2xl p-5 z-10 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-syne font-bold text-base text-text-primary">
            {editing ? "Edit Exchange Key" : "Add Exchange Key"}
          </h3>
          <button onClick={onClose} className="font-outfit text-xs text-text-muted">Cancel</button>
        </div>

        <div className="space-y-3">
          {/* Exchange selector */}
          <div>
            <p className="font-outfit text-xs text-text-muted mb-1.5">Exchange</p>
            <div className="grid grid-cols-3 gap-2">
              {(["okx","binance","bybit"] as const).map(e => (
                <button key={e} onClick={() => setExchange(e)}
                  className={cn("py-2 rounded-xl border font-outfit text-xs font-semibold transition-all",
                    exchange === e ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-text-muted")}>
                  {EXCHANGE_LABELS[e]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-outfit text-xs text-text-muted mb-1">Label (optional)</p>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main OKX account"
              className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-outfit text-sm text-text-primary outline-none focus:border-primary" />
          </div>

          <div>
            <p className="font-outfit text-xs text-text-muted mb-1">API Key</p>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste API key"
              className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-price text-xs text-text-primary outline-none focus:border-primary" />
          </div>

          <div>
            <p className="font-outfit text-xs text-text-muted mb-1">API Secret</p>
            <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Paste API secret"
              className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-price text-xs text-text-primary outline-none focus:border-primary" />
          </div>

          {isOkx && (
            <div>
              <p className="font-outfit text-xs text-text-muted mb-1">Passphrase <span className="text-down">*required for OKX</span></p>
              <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="OKX API passphrase"
                className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-price text-xs text-text-primary outline-none focus:border-primary" />
            </div>
          )}

          <div>
            <p className="font-outfit text-xs text-text-muted mb-1.5">Priority (1 = primary, higher = fallback)</p>
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4].map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className={cn("py-1.5 rounded-lg border font-price text-xs transition-all",
                    priority === p ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-text-muted")}>
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="font-outfit text-sm text-text-primary">Testnet mode</p>
              <p className="font-outfit text-xs text-text-muted">Use sandbox/testnet endpoints</p>
            </div>
            <button onClick={() => setTestnet(t => !t)}
              className={cn("relative w-11 h-6 rounded-full transition-colors", testnet ? "bg-yellow-500" : "bg-border-2")}>
              <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", testnet ? "translate-x-6" : "translate-x-1")} />
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            const data: Record<string, unknown> = { exchange, label, priority, is_testnet: testnet, is_active: true };
            if (apiKey)     data.api_key    = apiKey;
            if (apiSecret)  data.api_secret = apiSecret;
            if (passphrase) data.passphrase = passphrase;
            onSave(data);
          }}
          className="w-full mt-5 py-3 rounded-2xl bg-primary font-outfit font-semibold text-sm text-bg">
          {editing ? "Save Changes" : "Add Key"}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ────────────────────────────────────────────────── */

export default function AdminSettingsPage() {
  const toast   = useToastActions();
  const qc      = useQueryClient();
  const [tab, setTab] = useState<"general"|"fees"|"exchange">("general");
  const [editingKey, setEditingKey] = useState<ExchangeKey | null>(null);
  const [addingKey,  setAddingKey]  = useState(false);

  /* System config */
  const { data: raw } = useQuery({
    queryKey: ["admin", "system-config"],
    queryFn: () => apiGet<Record<string, string>>("/admin/system/config"),
  });
  const [config, setConfig] = useState<Partial<SystemConfig>>({});
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (raw) setConfig(raw as Partial<SystemConfig>); }, [raw]);
  function update(key: keyof SystemConfig, value: string) {
    setConfig(c => ({ ...c, [key]: value }));
    setIsDirty(true);
  }
  const save = useMutation({
    mutationFn: () => apiPatch("/admin/system/config", config),
    onSuccess: () => { toast.success("Settings saved"); setIsDirty(false); qc.invalidateQueries({ queryKey: ["admin","system-config"] }); },
    onError:   () => toast.error("Failed to save"),
  });

  /* Exchange keys */
  const { data: exchangeKeys } = useQuery({
    queryKey: ["admin", "exchange-keys"],
    queryFn: () => apiGet<ExchangeKey[]>("/admin/exchange-keys"),
  });
  const addKey = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/admin/exchange-keys", data),
    onSuccess: () => { toast.success("Key added — takes effect within 30s"); qc.invalidateQueries({ queryKey: ["admin","exchange-keys"] }); setAddingKey(false); },
    onError: () => toast.error("Failed to add key"),
  });
  const updateKey = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiPatch(`/admin/exchange-keys/${id}`, data),
    onSuccess: () => { toast.success("Key updated — takes effect within 30s"); qc.invalidateQueries({ queryKey: ["admin","exchange-keys"] }); setEditingKey(null); },
    onError: () => toast.error("Failed to update key"),
  });
  const deleteKey = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/admin/exchange-keys/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } }).then(r => r.json()),
    onSuccess: () => { toast.success("Key deleted"); qc.invalidateQueries({ queryKey: ["admin","exchange-keys"] }); },
  });
  const toggleKey = (id: string, is_active: boolean) => updateKey.mutate({ id, data: { is_active } });

  if (!config) return <div className="p-6"><div className="skeleton h-8 w-48 rounded-xl" /></div>;

  const TABS = [
    { id: "general" as const, label: "General" },
    { id: "fees"    as const, label: "Fees & Limits" },
    { id: "exchange" as const, label: "Exchange Keys" },
  ];

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2.5 font-outfit text-sm font-medium border-b-2 transition-all -mb-px",
              tab === t.id ? "text-text-primary border-primary" : "text-text-muted border-transparent")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ─────────────────────────────────────────────────── */}
      {tab === "general" && (
        <div className="space-y-4">
          <div className="bg-bg-surface border border-border rounded-2xl px-4">
            <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">System</p>
            <ConfigField label="Maintenance Mode"
              description={config.maintenance_mode === "true" ? "ACTIVE — All trading endpoints returning 503." : "Inactive — Exchange operating normally."}
              value={config.maintenance_mode ?? "false"} onChange={v => update("maintenance_mode", v)} type="toggle" />
          </div>
          <div className="bg-bg-surface border border-border rounded-2xl px-4">
            <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">M-Pesa</p>
            <ConfigField label="Paybill Number" description="Safaricom Paybill shown to users."
              value={config.paybill_number ?? ""} onChange={v => update("paybill_number", v)} />
            <ConfigField label="Display Name" description="Business name on M-Pesa STK push."
              value={config.mpesa_display_name ?? "KryptoKe"} onChange={v => update("mpesa_display_name", v)} />
          </div>
        </div>
      )}

      {/* ── Fees Tab ────────────────────────────────────────────────────── */}
      {tab === "fees" && (
        <div className="space-y-4">
          <div className="bg-bg-surface border border-border rounded-2xl px-4">
            <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">Spot Trading</p>
            <ConfigField label="Deposit Fee" description="% fee on M-Pesa deposits (0 = free)."
              value={config.deposit_fee_percent ?? "0"} onChange={v => update("deposit_fee_percent", v)} suffix="%" />
            <ConfigField label="Withdrawal Fee" description="% fee on M-Pesa withdrawals."
              value={config.withdrawal_fee_percent ?? "0.01"} onChange={v => update("withdrawal_fee_percent", v)} suffix="%" />
            <ConfigField label="Trading Spread" description="Spread % on all spot trades."
              value={config.trading_spread_percent ?? "0.005"} onChange={v => update("trading_spread_percent", v)} suffix="%" />
          </div>

          <div className="bg-bg-surface border border-border rounded-2xl px-4">
            <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">Futures Trading</p>
            <ConfigField label="Flat Fee per Trade" description="Fixed USD fee charged on every futures open/close."
              value={config.futures_fee_per_trade ?? "0.05"} onChange={v => update("futures_fee_per_trade", v)} prefix="$" />
            <ConfigField label="Spread %" description="Spread applied to entry price (makes entry slightly worse)."
              value={config.futures_spread_percent ?? "0.0004"} onChange={v => update("futures_spread_percent", v)} suffix="%" />
            <ConfigField label="Max Leverage" description="Maximum leverage users can set."
              value={config.futures_max_leverage ?? "125"} onChange={v => update("futures_max_leverage", v)} suffix="×" />
          </div>

          <div className="bg-bg-surface border border-border rounded-2xl px-4">
            <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">Limits</p>
            <ConfigField label="Daily Withdrawal Limit" description="Max KES a user can withdraw per day."
              value={config.daily_withdrawal_limit_kes ?? "150000"} onChange={v => update("daily_withdrawal_limit_kes", v)} prefix="KSh" />
            <ConfigField label="Min Deposit" description="Minimum KES for M-Pesa deposits."
              value={config.min_deposit_kes ?? "10"} onChange={v => update("min_deposit_kes", v)} prefix="KSh" />
            <ConfigField label="Min Withdrawal" description="Minimum KES for M-Pesa withdrawals."
              value={config.min_withdrawal_kes ?? "10"} onChange={v => update("min_withdrawal_kes", v)} prefix="KSh" />
          </div>
        </div>
      )}

      {/* ── Exchange Keys Tab ────────────────────────────────────────────── */}
      {tab === "exchange" && (
        <div className="space-y-4">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
            <p className="font-outfit text-xs font-semibold text-blue-400 mb-1">How routing works</p>
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              Futures orders route to the Priority 1 (Primary) key first. If it fails, Priority 2 is tried, then Priority 3.
              Key changes propagate within 30 seconds — no restart required. Toggle a key off to disable it without deleting.
            </p>
          </div>

          {/* Key list */}
          <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="font-syne font-semibold text-sm text-text-primary">API Keys</p>
              <button onClick={() => setAddingKey(true)}
                className="font-outfit text-xs text-primary px-3 py-1.5 rounded-lg border border-primary/30 active:bg-primary/5">
                + Add Key
              </button>
            </div>

            {!exchangeKeys || exchangeKeys.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="font-outfit text-sm text-text-muted">No keys configured yet.</p>
                <p className="font-outfit text-xs text-text-muted mt-1">Add an OKX key to start routing futures orders.</p>
              </div>
            ) : (
              exchangeKeys.map(k => (
                <ExchangeKeyRow
                  key={k.id}
                  k={k}
                  onEdit={setEditingKey}
                  onDelete={id => { if (confirm("Delete this key?")) deleteKey.mutate(id); }}
                  onToggle={toggleKey}
                />
              ))
            )}
          </div>

          {/* Routing status */}
          {exchangeKeys && exchangeKeys.length > 0 && (
            <div className="bg-bg-surface border border-border rounded-2xl px-4 py-3 space-y-2">
              <p className="font-syne font-semibold text-xs text-text-primary">Current Routing Order</p>
              {[...exchangeKeys]
                .filter(k => k.is_active)
                .sort((a, b) => a.priority - b.priority)
                .map((k, i) => (
                  <div key={k.id} className="flex items-center gap-2">
                    <span className="font-price text-[10px] text-text-muted w-4">{i + 1}.</span>
                    <span className={cn("font-outfit text-xs font-semibold", EXCHANGE_COLORS[k.exchange])}>
                      {EXCHANGE_LABELS[k.exchange]}
                    </span>
                    <span className="font-outfit text-xs text-text-muted">{k.label || "—"}</span>
                    {k.is_testnet && <span className="font-outfit text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded">TESTNET</span>}
                    {k.error_count > 5 && <span className="font-outfit text-[9px] text-down bg-down/10 px-1 rounded">{k.error_count} errors</span>}
                  </div>
                ))}
              {exchangeKeys.filter(k => k.is_active).length === 0 && (
                <p className="font-outfit text-xs text-down">No active keys — futures orders will fail</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save bar */}
      {isDirty && tab !== "exchange" && (
        <div className="sticky bottom-4">
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="w-full py-4 rounded-2xl bg-primary font-outfit font-semibold text-base text-bg shadow-glow disabled:opacity-60">
            {save.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Add/Edit key overlay */}
      {(addingKey || editingKey) && (
        <KeyFormSheet
          editing={editingKey}
          onClose={() => { setAddingKey(false); setEditingKey(null); }}
          onSave={(data) => {
            if (editingKey) {
              updateKey.mutate({ id: editingKey.id, data });
            } else {
              addKey.mutate(data);
            }
          }}
        />
      )}
    </div>
  );
}
