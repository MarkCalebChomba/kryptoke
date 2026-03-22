"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface Token {
  id: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingecko_id: string | null;
  icon_url: string | null;
  is_new: boolean;
  is_seed: boolean;
  chain_ids: number[];
  addresses: Record<string, string>;
  whitelisted_at: string;
}

interface ContractInfo {
  name: string;
  symbol: string;
  decimals: number;
  isVerified: boolean;
  isProxy: boolean;
  implementationAddress: string | null;
}

const EMPTY_FORM = {
  address: "",
  symbol: "",
  name: "",
  decimals: 18,
  coingeckoId: "",
  iconUrl: "",
  isSeed: false,
  isNew: true,
  chainIds: [56] as number[],
  addresses: {} as Record<string, string>,
};

const KNOWN_CHAINS = [
  { id: 1, name: "Ethereum" },
  { id: 56, name: "BSC" },
  { id: 137, name: "Polygon" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 8453, name: "Base" },
  { id: 250, name: "Fantom" },
  { id: 43114, name: "Avalanche" },
];

export default function AdminCoinsPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editToken, setEditToken] = useState<Token | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [autoFetching, setAutoFetching] = useState(false);
  const [autoFetchChainId, setAutoFetchChainId] = useState(56);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "coins"],
    queryFn: () => apiGet<{ items: Token[]; total: number }>("/admin/coins"),
    staleTime: 30_000,
  });

  const addCoin = useMutation({
    mutationFn: () => apiPost("/admin/coins", {
      ...form,
      decimals: Number(form.decimals),
      coingeckoId: form.coingeckoId || null,
      iconUrl: form.iconUrl || null,
    }),
    onSuccess: () => {
      toast.success("Coin added");
      queryClient.invalidateQueries({ queryKey: ["admin", "coins"] });
      setAddOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const editCoin = useMutation({
    mutationFn: () => apiPatch(`/admin/coins/${editToken!.address}`, {
      symbol: form.symbol || undefined,
      name: form.name || undefined,
      iconUrl: form.iconUrl || null,
      coingeckoId: form.coingeckoId || null,
      isSeed: form.isSeed,
      isNew: form.isNew,
      chainIds: form.chainIds,
      addresses: form.addresses,
    }),
    onSuccess: () => {
      toast.success("Coin updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "coins"] });
      setEditToken(null);
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const deleteCoin = useMutation({
    mutationFn: (address: string) => apiDelete(`/admin/coins/${address}`),
    onSuccess: () => {
      toast.success("Coin removed");
      queryClient.invalidateQueries({ queryKey: ["admin", "coins"] });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const [feeDrawerToken, setFeeDrawerToken] = useState<Token | null>(null);
  const [feeConfigs, setFeeConfigs] = useState<Record<string, { flat: string; pct: string; depositFrozen: boolean; withdrawFrozen: boolean }>>({});
  const [savingFee, setSavingFee] = useState<string | null>(null);

  const feeData = useQuery({
    queryKey: ["admin", "fees", feeDrawerToken?.symbol],
    queryFn: async () => {
      if (!feeDrawerToken) return [];
      const [chainsRes, freezeRes] = await Promise.all([
        apiGet<Array<{ chain_id: string; chain_name: string; withdraw_flat: string; withdraw_pct: string }>>("/admin/chain-fees"),
        apiGet<Array<{ chain_id: string; deposit_frozen: boolean; withdraw_frozen: boolean }>>(`/admin/token-freeze/${feeDrawerToken.symbol}`),
      ]);
      const freezeMap = Object.fromEntries((freezeRes ?? []).map((f: { chain_id: string; deposit_frozen: boolean; withdraw_frozen: boolean }) => [f.chain_id, f]));
      const configs: typeof feeConfigs = {};
      for (const chain of chainsRes ?? []) {
        const fr = (freezeMap as Record<string, { deposit_frozen: boolean; withdraw_frozen: boolean }>)[chain.chain_id] ?? { deposit_frozen: false, withdraw_frozen: false };
        configs[chain.chain_id] = {
          flat: chain.withdraw_flat ?? "0",
          pct: chain.withdraw_pct ?? "0",
          depositFrozen: fr.deposit_frozen,
          withdrawFrozen: fr.withdraw_frozen,
        };
      }
      setFeeConfigs(configs);
      return chainsRes ?? [];
    },
    enabled: !!feeDrawerToken,
    staleTime: 0,
  });

  async function saveFeeConfig(chainId: string) {
    setSavingFee(chainId);
    try {
      const cfg = feeConfigs[chainId];
      if (!cfg) return;
      await Promise.all([
        apiPatch(`/admin/chain-fees/${chainId}`, { withdrawFlat: cfg.flat, withdrawPct: cfg.pct }),
        apiPatch(`/admin/token-freeze`, {
          tokenSymbol: feeDrawerToken!.symbol,
          chainId,
          depositFrozen: cfg.depositFrozen,
          withdrawFrozen: cfg.withdrawFrozen,
        }),
      ]);
      toast.success(`Saved ${feeDrawerToken!.symbol} on ${chainId}`);
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingFee(null);
    }
  }

  async function handleAutoFetch() {
    if (!form.address.match(/^0x[0-9a-fA-F]{40}$/)) {
      toast.error("Enter a valid 0x address first");
      return;
    }
    setAutoFetching(true);
    try {
      const info = await apiGet<ContractInfo>(
        `/admin/coins/${form.address}/verify?chainId=${autoFetchChainId}`
      );
      setForm((f) => ({
        ...f,
        name: info.name || f.name,
        symbol: info.symbol || f.symbol,
        decimals: info.decimals,
      }));
      toast.success("Contract info fetched", `${info.name} (${info.symbol})`);
    } catch (err) {
      toast.error("Auto-fetch failed", err instanceof Error ? err.message : undefined);
    } finally {
      setAutoFetching(false);
    }
  }

  function openEdit(token: Token) {
    setEditToken(token);
    setForm({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      coingeckoId: token.coingecko_id ?? "",
      iconUrl: token.icon_url ?? "",
      isSeed: token.is_seed,
      isNew: token.is_new,
      chainIds: token.chain_ids ?? [56],
      addresses: token.addresses ?? {},
    });
  }

  function toggleChainId(id: number) {
    setForm((f) => ({
      ...f,
      chainIds: f.chainIds.includes(id)
        ? f.chainIds.filter((c) => c !== id)
        : [...f.chainIds, id],
    }));
  }

  const filtered = (data?.items ?? []).filter(
    (t) =>
      !search ||
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.address.toLowerCase().includes(search.toLowerCase())
  );

  function Field({ label, value, onChange, placeholder, type = "text" }: {
    label: string; value: string | number; onChange: (v: string) => void;
    placeholder?: string; type?: string;
  }) {
    return (
      <div>
        <label className="block font-outfit text-xs text-text-secondary mb-1">{label}</label>
        <input
          type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-outfit text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
        />
      </div>
    );
  }

  function Toggle({ label, sub, value, onChange }: {
    label: string; sub?: string; value: boolean; onChange: (v: boolean) => void;
  }) {
    return (
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="font-outfit text-sm text-text-primary">{label}</p>
          {sub && <p className="font-outfit text-xs text-text-muted">{sub}</p>}
        </div>
        <button
          onClick={() => onChange(!value)}
          className={cn("relative w-11 h-6 rounded-full transition-colors", value ? "bg-primary" : "bg-border-2")}
        >
          <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", value ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>
    );
  }

  const FormFields = () => (
    <div className="space-y-3">
      {/* Address + auto-fetch */}
      <div>
        <label className="block font-outfit text-xs text-text-secondary mb-1">Contract Address *</label>
        <div className="flex gap-2">
          <input
            type="text" value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value.trim() }))}
            placeholder="0x..."
            className="flex-1 bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-price text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
          />
          <select
            value={autoFetchChainId}
            onChange={(e) => setAutoFetchChainId(Number(e.target.value))}
            className="bg-bg-surface2 border border-border rounded-xl px-2 py-2.5 font-outfit text-xs text-text-primary outline-none focus:border-primary"
          >
            {KNOWN_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={handleAutoFetch}
            disabled={autoFetching}
            className="px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 font-outfit text-xs text-primary font-semibold whitespace-nowrap"
          >
            {autoFetching ? "..." : "Auto-fill"}
          </button>
        </div>
        <p className="font-outfit text-xs text-text-muted mt-1">
          Paste address → select chain → Auto-fill fetches name, symbol, decimals
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol *" value={form.symbol} onChange={(v) => setForm((f) => ({ ...f, symbol: v.toUpperCase() }))} placeholder="USDT" />
        <Field label="Decimals" value={form.decimals} onChange={(v) => setForm((f) => ({ ...f, decimals: parseInt(v) || 18 }))} type="number" />
      </div>
      <Field label="Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Tether USD" />
      <Field label="CoinGecko ID (optional)" value={form.coingeckoId} onChange={(v) => setForm((f) => ({ ...f, coingeckoId: v }))} placeholder="tether" />
      <Field label="Icon URL (optional)" value={form.iconUrl} onChange={(v) => setForm((f) => ({ ...f, iconUrl: v }))} placeholder="https://..." />

      {/* Chain selection */}
      <div>
        <label className="block font-outfit text-xs text-text-secondary mb-2">Available on chains</label>
        <div className="flex flex-wrap gap-2">
          {KNOWN_CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => toggleChainId(chain.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg font-outfit text-xs font-medium border transition-all",
                form.chainIds.includes(chain.id)
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-text-muted"
              )}
            >
              {chain.name}
            </button>
          ))}
        </div>
      </div>

      {/* Per-chain addresses */}
      {form.chainIds.length > 0 && (
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-2">
            Contract address per chain (optional — auto-fills primary address on primary chain)
          </label>
          <div className="space-y-2">
            {form.chainIds.map((chainId) => {
              const chainName = KNOWN_CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;
              return (
                <div key={chainId} className="flex items-center gap-2">
                  <span className="font-outfit text-xs text-text-muted w-20 flex-shrink-0">{chainName}</span>
                  <input
                    type="text"
                    value={form.addresses[String(chainId)] ?? (chainId === (form.chainIds[0] ?? 56) ? form.address : "")}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      addresses: { ...f.addresses, [String(chainId)]: e.target.value.trim() },
                    }))}
                    placeholder="0x..."
                    className="flex-1 bg-bg-surface2 border border-border rounded-xl px-3 py-2 font-price text-xs text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Toggle
        label="New Listing"
        sub="Shows NEW badge in markets"
        value={form.isNew}
        onChange={(v) => setForm((f) => ({ ...f, isNew: v }))}
      />
      <Toggle
        label="Seed Round Token"
        sub="Shows SEED badge — higher risk warning"
        value={form.isSeed}
        onChange={(v) => setForm((f) => ({ ...f, isSeed: v }))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-xl text-text-primary">Coins & Tokens</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">{data?.total ?? 0} tokens listed</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
          className="px-4 py-2.5 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg"
        >
          + Add Coin
        </button>
      </div>

      {/* Search */}
      <input
        type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search symbol, name or address..."
        className="w-full bg-bg-surface border border-border rounded-xl px-4 py-2.5 font-outfit text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
      />

      {/* Token table */}
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-5 gap-3 px-4 py-2.5 border-b border-border bg-bg-surface2">
          {["Token", "Address", "Chains", "Status", "Actions"].map((h) => (
            <p key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</p>
          ))}
        </div>

        <div className="divide-y divide-border/50">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 gap-3 px-4 py-3">
                  {Array.from({ length: 4 }).map((_, j) => <div key={j} className="skeleton h-3 rounded" />)}
                  <div className="skeleton h-6 w-16 rounded-lg" />
                </div>
              ))
            : filtered.length === 0
              ? <div className="py-12 text-center"><p className="font-outfit text-sm text-text-muted">No tokens found</p></div>
              : filtered.map((token) => (
                  <div key={token.address} className="grid grid-cols-5 gap-3 px-4 py-3 items-center hover:bg-bg-surface2 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      {token.icon_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={token.icon_url} alt={token.symbol} className="w-6 h-6 rounded-full flex-shrink-0" />
                        : <div className="w-6 h-6 rounded-full bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
                            <span className="font-price text-[9px] text-text-muted">{token.symbol.slice(0, 2)}</span>
                          </div>
                      }
                      <div className="min-w-0">
                        <p className="font-outfit text-sm font-semibold text-text-primary">{token.symbol}</p>
                        <p className="font-outfit text-xs text-text-muted truncate">{token.name}</p>
                      </div>
                    </div>
                    <p className="font-price text-xs text-text-muted truncate">{token.address.slice(0, 10)}...</p>
                    <div className="flex flex-wrap gap-1">
                      {(token.chain_ids ?? [56]).slice(0, 3).map((id) => (
                        <span key={id} className="font-price text-[10px] text-text-muted bg-bg-surface2 border border-border px-1.5 py-0.5 rounded">
                          {KNOWN_CHAINS.find((c) => c.id === id)?.name ?? id}
                        </span>
                      ))}
                      {(token.chain_ids ?? []).length > 3 && (
                        <span className="font-price text-[10px] text-text-muted">+{token.chain_ids.length - 3}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {token.is_new && <span className="font-outfit text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">NEW</span>}
                      {token.is_seed && <span className="font-outfit text-[10px] font-bold text-down bg-down/10 px-1.5 py-0.5 rounded">SEED</span>}
                      {!token.is_new && !token.is_seed && <span className="font-outfit text-[10px] text-up bg-up/10 px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(token)}
                        className="font-outfit text-xs text-primary font-medium hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setFeeDrawerToken(token)}
                        className="font-outfit text-xs text-gold font-medium hover:underline"
                      >
                        Fees
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${token.symbol}?`)) deleteCoin.mutate(token.address); }}
                        className="font-outfit text-xs text-down font-medium hover:underline"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))
          }
        </div>
      </div>

      {/* Add coin sheet */}
      <BottomSheet isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Coin / Token" showCloseButton>
        <div className="px-4 pb-6 max-h-[85dvh] overflow-y-auto">
          <FormFields />
          <button
            onClick={() => addCoin.mutate()}
            disabled={!form.address || !form.symbol || !form.name || addCoin.isPending}
            className="btn-primary mt-4"
          >
            {addCoin.isPending ? "Adding..." : "Add Coin"}
          </button>
        </div>
      </BottomSheet>

      {/* Edit coin sheet */}
      <BottomSheet isOpen={!!editToken} onClose={() => setEditToken(null)} title={`Edit ${editToken?.symbol ?? ""}`} showCloseButton>
        <div className="px-4 pb-6 max-h-[85dvh] overflow-y-auto">
          <FormFields />
          <button
            onClick={() => editCoin.mutate()}
            disabled={editCoin.isPending}
            className="btn-primary mt-4"
          >
            {editCoin.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </BottomSheet>

      {/* Fee & Freeze drawer */}
      <BottomSheet isOpen={!!feeDrawerToken} onClose={() => setFeeDrawerToken(null)} title={`${feeDrawerToken?.symbol ?? ""} — Fees & Freeze`} showCloseButton>
        <div className="px-4 pb-8 max-h-[90dvh] overflow-y-auto">
          <p className="font-outfit text-xs text-text-muted mb-4">
            Set withdrawal fees and freeze deposit/withdrawal per chain for <span className="text-text-primary font-semibold">{feeDrawerToken?.symbol}</span>.
            Changes take effect immediately.
          </p>
          {feeData.isLoading && <p className="text-text-muted font-outfit text-sm py-4">Loading...</p>}
          <div className="space-y-3">
            {(feeData.data ?? []).map((chain: { chain_id: string; chain_name: string }) => {
              const cfg = feeConfigs[chain.chain_id];
              if (!cfg) return null;
              return (
                <div key={chain.chain_id} className="border border-border rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-outfit font-semibold text-sm text-text-primary">{chain.chain_name}</p>
                      <p className="font-outfit text-[10px] text-text-muted">{chain.chain_id}</p>
                    </div>
                    <button
                      onClick={() => saveFeeConfig(chain.chain_id)}
                      disabled={savingFee === chain.chain_id}
                      className="px-3 py-1.5 bg-primary rounded-lg font-outfit text-xs font-semibold text-bg disabled:opacity-50"
                    >
                      {savingFee === chain.chain_id ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {/* Fee inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-outfit text-[10px] text-text-muted uppercase mb-1 block">Flat fee</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={cfg.flat}
                        onChange={(e) => setFeeConfigs((prev) => ({ ...prev, [chain.chain_id]: { ...prev[chain.chain_id]!, flat: e.target.value } }))}
                        className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 font-price text-sm text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="font-outfit text-[10px] text-text-muted uppercase mb-1 block">% fee</label>
                      <input
                        type="number" step="0.001" min="0" max="1"
                        value={cfg.pct}
                        onChange={(e) => setFeeConfigs((prev) => ({ ...prev, [chain.chain_id]: { ...prev[chain.chain_id]!, pct: e.target.value } }))}
                        className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 font-price text-sm text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  {/* Freeze toggles */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFeeConfigs((prev) => ({ ...prev, [chain.chain_id]: { ...prev[chain.chain_id]!, depositFrozen: !cfg.depositFrozen } }))}
                      className={cn(
                        "flex-1 py-2 rounded-xl font-outfit text-xs font-semibold border transition-colors",
                        cfg.depositFrozen
                          ? "bg-down/10 border-down/40 text-down"
                          : "bg-bg-surface2 border-border text-text-muted"
                      )}
                    >
                      {cfg.depositFrozen ? "🔒 Deposits FROZEN" : "Deposits open"}
                    </button>
                    <button
                      onClick={() => setFeeConfigs((prev) => ({ ...prev, [chain.chain_id]: { ...prev[chain.chain_id]!, withdrawFrozen: !cfg.withdrawFrozen } }))}
                      className={cn(
                        "flex-1 py-2 rounded-xl font-outfit text-xs font-semibold border transition-colors",
                        cfg.withdrawFrozen
                          ? "bg-down/10 border-down/40 text-down"
                          : "bg-bg-surface2 border-border text-text-muted"
                      )}
                    >
                      {cfg.withdrawFrozen ? "🔒 Withdrawals FROZEN" : "Withdrawals open"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </BottomSheet>

    </div>
  );
}