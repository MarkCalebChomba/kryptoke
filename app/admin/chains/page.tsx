"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { cn } from "@/lib/utils/cn";

interface Chain {
  id: number;
  name: string;
  nativeSymbol: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerTxPath: string;
  usdtAddress: string | null;
  usdcAddress: string | null;
  confirmationsRequired: number;
  arrivalTime: string;
  approxFee: string;
  recommended: boolean;
  warning: string | null;
  active: boolean;
  source: "hardcoded" | "admin";
}

const EMPTY_CHAIN = {
  id: 0,
  name: "",
  nativeSymbol: "",
  rpcUrl: "",
  explorerUrl: "",
  explorerTxPath: "/tx/",
  usdtAddress: "",
  usdcAddress: "",
  confirmationsRequired: 1,
  arrivalTime: "~1 minute",
  approxFee: "~$0.10",
  recommended: false,
  warning: "",
  active: true,
};

export default function AdminChainsPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CHAIN);

  const { data: chains, isLoading } = useQuery({
    queryKey: ["admin", "chains"],
    queryFn: () => apiGet<Chain[]>("/admin/chains"),
    staleTime: 30_000,
  });

  const addChain = useMutation({
    mutationFn: () => apiPost("/admin/chains", {
      ...form,
      id: Number(form.id),
      confirmationsRequired: Number(form.confirmationsRequired),
      usdtAddress: form.usdtAddress || null,
      usdcAddress: form.usdcAddress || null,
      warning: form.warning || null,
    }),
    onSuccess: () => {
      toast.success("Chain added");
      queryClient.invalidateQueries({ queryKey: ["admin", "chains"] });
      setAddOpen(false);
      setForm(EMPTY_CHAIN);
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const toggleChain = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiPatch(`/admin/chains/${id}`, { active }),
    onSuccess: () => {
      toast.success("Chain updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "chains"] });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const deleteChain = useMutation({
    mutationFn: (id: number) => apiDelete(`/admin/chains/${id}`),
    onSuccess: () => {
      toast.success("Chain removed");
      queryClient.invalidateQueries({ queryKey: ["admin", "chains"] });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

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

  const active = (chains ?? []).filter((c) => c.active);
  const inactive = (chains ?? []).filter((c) => !c.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-xl text-text-primary">Blockchain Networks</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">
            {active.length} active · {inactive.length} inactive · powered by Etherscan V2
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg"
        >
          + Add Chain
        </button>
      </div>

      {/* Active chains */}
      <div>
        <p className="font-outfit text-xs text-text-muted uppercase tracking-wider mb-3">
          Active ({active.length})
        </p>
        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-bg-surface border border-border rounded-2xl p-4">
                  <div className="skeleton h-4 w-32 mb-2" /><div className="skeleton h-3 w-48" />
                </div>
              ))
            : active.map((chain) => (
                <ChainRow
                  key={chain.id}
                  chain={chain}
                  onToggle={(active) => toggleChain.mutate({ id: chain.id, active })}
                  onDelete={chain.source === "admin" ? () => deleteChain.mutate(chain.id) : undefined}
                  isLoading={toggleChain.isPending || deleteChain.isPending}
                />
              ))
          }
        </div>
      </div>

      {/* Inactive chains */}
      {inactive.length > 0 && (
        <div>
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wider mb-3">
            Inactive ({inactive.length})
          </p>
          <div className="space-y-2">
            {inactive.map((chain) => (
              <ChainRow
                key={chain.id}
                chain={chain}
                onToggle={(active) => toggleChain.mutate({ id: chain.id, active })}
                onDelete={chain.source === "admin" ? () => deleteChain.mutate(chain.id) : undefined}
                isLoading={toggleChain.isPending || deleteChain.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add chain sheet */}
      <BottomSheet isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add EVM Chain" showCloseButton>
        <div className="px-4 pb-6 space-y-3 max-h-[80dvh] overflow-y-auto">
          <div className="card border-primary/20 bg-primary/5 mb-2">
            <p className="font-outfit text-xs text-primary leading-relaxed">
              Any EVM chain supported by Etherscan V2 works here.
              Find the chain ID at <a href="https://chainlist.org" target="_blank" rel="noopener noreferrer" className="underline">chainlist.org</a>.
              The Etherscan V2 explorer API is automatic — no extra keys needed.
            </p>
          </div>

          <Field label="Chain ID *" value={form.id} onChange={(v) => setForm((f) => ({ ...f, id: parseInt(v) || 0 }))} placeholder="e.g. 999 for HyperEVM" type="number" />
          <Field label="Chain Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. HyperEVM" />
          <Field label="Native Symbol *" value={form.nativeSymbol} onChange={(v) => setForm((f) => ({ ...f, nativeSymbol: v.toUpperCase() }))} placeholder="e.g. HYPE" />
          <Field label="RPC URL *" value={form.rpcUrl} onChange={(v) => setForm((f) => ({ ...f, rpcUrl: v }))} placeholder="https://rpc.hyperliquid.xyz/evm" />
          <Field label="Explorer URL *" value={form.explorerUrl} onChange={(v) => setForm((f) => ({ ...f, explorerUrl: v }))} placeholder="https://explorer.hyperliquid.xyz" />
          <Field label="Explorer TX Path" value={form.explorerTxPath} onChange={(v) => setForm((f) => ({ ...f, explorerTxPath: v }))} placeholder="/tx/" />
          <Field label="USDT Contract Address" value={form.usdtAddress} onChange={(v) => setForm((f) => ({ ...f, usdtAddress: v }))} placeholder="0x... (leave blank if no USDT)" />
          <Field label="USDC Contract Address" value={form.usdcAddress} onChange={(v) => setForm((f) => ({ ...f, usdcAddress: v }))} placeholder="0x... (leave blank if no USDC)" />
          <Field label="Confirmations Required" value={form.confirmationsRequired} onChange={(v) => setForm((f) => ({ ...f, confirmationsRequired: parseInt(v) || 1 }))} type="number" />
          <Field label="Arrival Time (display)" value={form.arrivalTime} onChange={(v) => setForm((f) => ({ ...f, arrivalTime: v }))} placeholder="~1 minute" />
          <Field label="Approx Fee (display)" value={form.approxFee} onChange={(v) => setForm((f) => ({ ...f, approxFee: v }))} placeholder="~$0.05" />
          <Field label="Warning (optional)" value={form.warning} onChange={(v) => setForm((f) => ({ ...f, warning: v }))} placeholder="e.g. Lower liquidity" />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-outfit text-sm text-text-primary">Recommended</p>
              <p className="font-outfit text-xs text-text-muted">Show first in deposit network selector</p>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, recommended: !f.recommended }))}
              className={cn("relative w-11 h-6 rounded-full transition-colors", form.recommended ? "bg-primary" : "bg-border-2")}
            >
              <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", form.recommended ? "translate-x-6" : "translate-x-1")} />
            </button>
          </div>

          <button
            onClick={() => addChain.mutate()}
            disabled={!form.id || !form.name || !form.rpcUrl || !form.explorerUrl || addChain.isPending}
            className="btn-primary mt-2"
          >
            {addChain.isPending ? "Adding chain..." : "Add Chain"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ChainRow({ chain, onToggle, onDelete, isLoading }: {
  chain: Chain;
  onToggle: (active: boolean) => void;
  onDelete?: () => void;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "bg-bg-surface border rounded-2xl overflow-hidden transition-all",
      chain.active ? "border-border" : "border-border/40 opacity-60"
    )}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left"
      >
        <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", chain.active ? "bg-up" : "bg-text-muted")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-outfit font-semibold text-sm text-text-primary">{chain.name}</p>
            <span className="font-price text-xs text-text-muted">#{chain.id}</span>
            {chain.source === "admin" && (
              <span className="font-outfit text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">CUSTOM</span>
            )}
            {chain.recommended && (
              <span className="font-outfit text-[10px] font-bold text-up bg-up/10 px-1.5 py-0.5 rounded">RECOMMENDED</span>
            )}
          </div>
          <p className="font-outfit text-xs text-text-muted mt-0.5">
            {chain.nativeSymbol} · {chain.arrivalTime} · {chain.approxFee}
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={cn("text-text-muted transition-transform", expanded && "rotate-180")}>
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 bg-bg space-y-3">
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex gap-2">
              <span className="text-text-muted w-24 flex-shrink-0">RPC</span>
              <span className="font-price text-text-primary break-all">{chain.rpcUrl}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-muted w-24 flex-shrink-0">Explorer</span>
              <a href={chain.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-primary break-all hover:underline">{chain.explorerUrl}</a>
            </div>
            {chain.usdtAddress && (
              <div className="flex gap-2">
                <span className="text-text-muted w-24 flex-shrink-0">USDT</span>
                <span className="font-price text-text-primary break-all">{chain.usdtAddress}</span>
              </div>
            )}
            {chain.usdcAddress && (
              <div className="flex gap-2">
                <span className="text-text-muted w-24 flex-shrink-0">USDC</span>
                <span className="font-price text-text-primary break-all">{chain.usdcAddress}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-text-muted w-24 flex-shrink-0">Confirmations</span>
              <span className="font-price text-text-primary">{chain.confirmationsRequired}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onToggle(!chain.active)}
              disabled={isLoading}
              className={cn(
                "flex-1 py-2 rounded-xl font-outfit font-semibold text-sm transition-all",
                chain.active
                  ? "bg-down/10 text-down border border-down/30"
                  : "bg-up/10 text-up border border-up/30"
              )}
            >
              {chain.active ? "Disable" : "Enable"}
            </button>
            {onDelete && (
              <button
                onClick={() => { if (confirm(`Delete ${chain.name}?`)) onDelete(); }}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-bg-surface2 border border-border font-outfit text-sm text-text-muted"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
