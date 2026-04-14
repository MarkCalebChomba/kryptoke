"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { IconCopy, IconCheck, IconTrash } from "@/components/icons";

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;  // first 8 + last 4 chars
  permissions: string[];
  ip_whitelist: string[] | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

const ALL_PERMISSIONS = [
  { id: "read",           label: "Read",           desc: "View balances, orders, and market data" },
  { id: "spot_trade",     label: "Spot Trading",   desc: "Place and cancel spot orders" },
  { id: "futures_trade",  label: "Futures Trading",desc: "Open and close futures positions" },
  { id: "withdraw",       label: "Withdrawals",    desc: "Requires IP restriction to enable" },
] as const;

/* ─── Create Key Sheet ────────────────────────────────────────────────────── */
function CreateKeySheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc    = useQueryClient();
  const [label, setLabel]         = useState("");
  const [perms, setPerms]         = useState<string[]>(["read"]);
  const [ipLimit, setIpLimit]     = useState(false);
  const [ips, setIps]             = useState("");
  const [newKey, setNewKey]       = useState<{ key: string; secret: string } | null>(null);
  const [copied, setCopied]       = useState<"key" | "secret" | null>(null);

  const createMutation = useMutation({
    mutationFn: () => apiPost<{ key: string; secret: string }>("/account/api-keys", {
      label,
      permissions: perms,
      ipWhitelist: ipLimit ? ips.split("\n").map(s => s.trim()).filter(Boolean) : null,
    }),
    onSuccess: (data) => {
      setNewKey(data);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => toast.error("Failed to create key", err instanceof Error ? err.message : ""),
  });

  function copy(type: "key" | "secret") {
    const text = type === "key" ? newKey?.key : newKey?.secret;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
    toast.copied();
  }

  function togglePerm(p: string) {
    setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function handleClose() {
    setNewKey(null);
    setLabel("");
    setPerms(["read"]);
    setIpLimit(false);
    setIps("");
    onClose();
  }

  if (newKey) {
    return (
      <BottomSheet isOpen={isOpen} onClose={handleClose} title="API Key Created" showCloseButton>
        <div className="px-4 pb-8 space-y-4">
          <div className="px-3 py-2.5 rounded-xl bg-down/8 border border-down/30">
            <p className="font-outfit text-xs font-semibold text-down mb-1">Save your secret key now</p>
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              The secret key is shown only once and cannot be retrieved again. Copy it immediately and store it securely.
            </p>
          </div>
          {[
            { label: "API Key", value: newKey.key, type: "key" as const },
            { label: "Secret Key", value: newKey.secret, type: "secret" as const },
          ].map(({ label, value, type }) => (
            <div key={type}>
              <p className="font-outfit text-xs text-text-muted mb-1.5">{label}</p>
              <div className="flex items-center gap-2 bg-bg-surface2 border border-border rounded-xl px-3 py-2.5">
                <code className="flex-1 font-price text-xs text-text-primary break-all">{value}</code>
                <button onClick={() => copy(type)} className="flex-shrink-0 tap-target">
                  {copied === type
                    ? <IconCheck size={16} className="text-up" />
                    : <IconCopy size={16} className="text-text-muted" />}
                </button>
              </div>
            </div>
          ))}
          <button onClick={handleClose} className="btn-primary">I have saved the secret key</button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Create API Key" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Key Label</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value.slice(0, 50))}
            className="input-field" placeholder="e.g. MyTradingBot" />
        </div>

        <div>
          <label className="block font-outfit text-xs text-text-muted mb-2">Permissions</label>
          <div className="space-y-2">
            {ALL_PERMISSIONS.map(p => (
              <button key={p.id}
                onClick={() => p.id !== "read" && togglePerm(p.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all",
                  perms.includes(p.id) ? "border-primary/50 bg-primary/8" : "border-border",
                  p.id === "read" && "opacity-60 cursor-default",
                  p.id === "withdraw" && !ipLimit && perms.includes("withdraw") && "!border-down/40"
                )}>
                <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                  perms.includes(p.id) ? "border-primary bg-primary" : "border-border")}>
                  {perms.includes(p.id) && <span className="text-bg text-[8px] font-bold">✓</span>}
                </div>
                <div className="flex-1">
                  <p className={cn("font-outfit text-sm font-medium", perms.includes(p.id) ? "text-primary" : "text-text-primary")}>{p.label}</p>
                  <p className="font-outfit text-[10px] text-text-muted">{p.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* IP Restriction */}
        <div>
          <button onClick={() => setIpLimit(v => !v)}
            className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all",
              ipLimit ? "border-up/50 bg-up/8" : "border-border")}>
            <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
              ipLimit ? "border-up bg-up" : "border-border")}>
              {ipLimit && <span className="text-bg text-[8px] font-bold">✓</span>}
            </div>
            <div>
              <p className={cn("font-outfit text-sm font-medium", ipLimit ? "text-up" : "text-text-primary")}>
                IP Restriction (Recommended)
              </p>
              <p className="font-outfit text-[10px] text-text-muted">Required before enabling withdrawals</p>
            </div>
          </button>
          {ipLimit && (
            <textarea value={ips} onChange={e => setIps(e.target.value)}
              className="input-field mt-2 text-xs font-price resize-none" rows={3}
              placeholder={"One IP per line:\n192.168.1.1\n10.0.0.1"} />
          )}
        </div>

        <button
          onClick={() => createMutation.mutate()}
          disabled={!label.trim() || createMutation.isPending}
          className="btn-primary disabled:opacity-50">
          {createMutation.isPending ? "Creating..." : "Create API Key"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Key Row ──────────────────────────────────────────────────────────────── */
function KeyRow({ apiKey, onDelete }: { apiKey: ApiKey; onDelete: () => void }) {
  const qc   = useQueryClient();
  const toast = useToastActions();

  const toggleMutation = useMutation({
    mutationFn: () => apiPatch(`/account/api-keys/${apiKey.id}`, { is_active: !apiKey.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="px-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-outfit text-sm font-semibold text-text-primary">{apiKey.label}</p>
            <span className={cn("text-[9px] font-bold font-outfit px-1.5 py-0.5 rounded",
              apiKey.is_active ? "bg-up/15 text-up" : "bg-border text-text-muted")}>
              {apiKey.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <code className="font-price text-[10px] text-text-muted">{apiKey.key_prefix}</code>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {apiKey.permissions.map(p => (
              <span key={p} className="font-outfit text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize">
                {p.replace("_", " ")}
              </span>
            ))}
          </div>
          <p className="font-outfit text-[9px] text-text-muted mt-1">
            Created {new Date(apiKey.created_at).toLocaleDateString("en-KE")}
            {apiKey.last_used_at && ` · Last used ${new Date(apiKey.last_used_at).toLocaleDateString("en-KE")}`}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={() => toggleMutation.mutate()}
            className="px-2.5 py-1 rounded-lg border border-border font-outfit text-[10px] text-text-muted active:bg-bg-surface2">
            {apiKey.is_active ? "Disable" : "Enable"}
          </button>
          <button onClick={onDelete}
            className="px-2.5 py-1 rounded-lg border border-down/40 font-outfit text-[10px] text-down active:bg-down/10">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function ApiManagementPage() {
  const toast   = useToastActions();
  const qc      = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: keysData, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiGet<{ data: ApiKey[] }>("/account/api-keys"),
    staleTime: 30_000,
  });

  const keys = keysData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/account/api-keys/${id}`),
    onSuccess: () => { toast.success("API key deleted"); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: () => toast.error("Failed to delete key"),
  });

  return (
    <div className="screen">
      <TopBar title="API Management" showBack />

      {/* Info banner */}
      <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
        <p className="font-syne font-bold text-xs text-primary mb-1">REST API Access</p>
        <p className="font-outfit text-xs text-text-muted leading-relaxed">
          Use API keys to integrate KryptoKe with your trading bots and applications. Base URL: <code className="text-primary text-[10px]">https://api.kryptoke.com/v1</code>
        </p>
      </div>

      {/* Limits */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "REST Limit",    value: "1200/min" },
          { label: "Max Keys",      value: `${keys.length}/30` },
          { label: "Order Rate",    value: "50/10s" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-bg-surface2 rounded-xl px-3 py-2.5 border border-border text-center">
            <p className="font-price text-sm font-semibold text-text-primary">{value}</p>
            <p className="font-outfit text-[9px] text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Create button */}
      <div className="px-4 mt-4">
        <button onClick={() => setCreateOpen(true)} disabled={keys.length >= 30} className="btn-primary disabled:opacity-50">
          + Create API Key
        </button>
      </div>

      {/* Key list */}
      <div className="mx-4 mt-4 border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center px-6">
            <p className="text-3xl mb-2">🔑</p>
            <p className="font-syne font-bold text-sm text-text-primary mb-1">No API keys yet</p>
            <p className="font-outfit text-xs text-text-muted">Create a key to connect your trading bots</p>
          </div>
        ) : (
          keys.map(key => (
            <KeyRow key={key.id} apiKey={key} onDelete={() => deleteMutation.mutate(key.id)} />
          ))
        )}
      </div>

      {/* Security notes */}
      <div className="mx-4 mt-3 mb-8 px-4 py-3 rounded-xl bg-gold/5 border border-gold/20">
        <p className="font-outfit text-xs font-semibold text-gold mb-1.5">Security Best Practices</p>
        <div className="space-y-1">
          {[
            "Never share your secret key with anyone",
            "Always enable IP restriction for production keys",
            "Use separate keys per application",
            "Enable only the permissions you need",
            "Rotate keys regularly and revoke unused ones",
          ].map(tip => (
            <div key={tip} className="flex items-start gap-1.5">
              <span className="text-gold text-[10px] flex-shrink-0 mt-0.5">•</span>
              <span className="font-outfit text-[10px] text-text-muted">{tip}</span>
            </div>
          ))}
        </div>
      </div>

      <CreateKeySheet isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
