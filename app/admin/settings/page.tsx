"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";

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
}

interface ConfigFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "toggle";
  prefix?: string;
  suffix?: string;
}

function ConfigField({ label, description, value, onChange, type = "text", prefix, suffix }: ConfigFieldProps) {
  if (type === "toggle") {
    const isOn = value === "true";
    return (
      <div className="flex items-start justify-between py-4 border-b border-border/50">
        <div className="flex-1 mr-4">
          <p className="font-outfit text-sm font-medium text-text-primary">{label}</p>
          <p className="font-outfit text-xs text-text-muted mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => onChange(isOn ? "false" : "true")}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
            isOn ? "bg-down" : "bg-border-2"
          )}
          aria-label={label}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
            isOn ? "translate-x-7" : "translate-x-1"
          )} />
        </button>
      </div>
    );
  }

  return (
    <div className="py-4 border-b border-border/50">
      <label className="block font-outfit text-sm font-medium text-text-primary mb-0.5">{label}</label>
      <p className="font-outfit text-xs text-text-muted mb-2">{description}</p>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-outfit text-sm text-text-muted">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full bg-bg-surface2 border border-border rounded-xl py-2.5 font-price text-sm text-text-primary outline-none focus:border-primary",
            prefix ? "pl-10 pr-4" : "px-4",
            suffix ? "pr-14" : ""
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-outfit text-xs text-text-muted">{suffix}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Partial<SystemConfig>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: remoteConfig, isLoading } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => apiGet<SystemConfig>("/admin/system/config"),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (remoteConfig) {
      setConfig(remoteConfig);
      setIsDirty(false);
    }
  }, [remoteConfig]);

  function update(key: keyof SystemConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  const save = useMutation({
    mutationFn: () => apiPatch("/admin/system/config", config),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "config"] });
      setIsDirty(false);
    },
    onError: (err) => {
      toast.error("Failed to save", err instanceof Error ? err.message : undefined);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-xl" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Settings</h1>
        {isDirty && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-6 py-2.5 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg disabled:opacity-60 active:opacity-85 transition-opacity"
          >
            {save.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      {/* Maintenance mode — most prominent */}
      <div className={cn(
        "rounded-2xl border p-4",
        config.maintenance_mode === "true" ? "border-down/40 bg-down/5" : "border-border bg-bg-surface"
      )}>
        <ConfigField
          label="Maintenance Mode"
          description={config.maintenance_mode === "true"
            ? "ACTIVE — All trading endpoints are returning 503. Users see a maintenance banner."
            : "Inactive — Exchange is operating normally."}
          value={config.maintenance_mode ?? "false"}
          onChange={(v) => update("maintenance_mode", v)}
          type="toggle"
        />
      </div>

      {/* Fee configuration */}
      <div className="bg-bg-surface border border-border rounded-2xl px-4">
        <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">
          Fee Configuration
        </p>
        <ConfigField
          label="Deposit Fee"
          description="Percentage fee charged on M-Pesa deposits. Currently 0% (free)."
          value={config.deposit_fee_percent ?? "0"}
          onChange={(v) => update("deposit_fee_percent", v)}
          suffix="%"
        />
        <ConfigField
          label="Withdrawal Fee"
          description="Percentage fee charged on KES withdrawals via M-Pesa."
          value={config.withdrawal_fee_percent ?? "0.01"}
          onChange={(v) => update("withdrawal_fee_percent", v)}
          suffix="%"
        />
        <ConfigField
          label="Trading Spread"
          description="Spread percentage applied to all trades (our revenue margin)."
          value={config.trading_spread_percent ?? "0.005"}
          onChange={(v) => update("trading_spread_percent", v)}
          suffix="%"
        />
      </div>

      {/* Limits */}
      <div className="bg-bg-surface border border-border rounded-2xl px-4">
        <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">
          Transaction Limits
        </p>
        <ConfigField
          label="Daily Withdrawal Limit"
          description="Maximum KES a user can withdraw in a single day."
          value={config.daily_withdrawal_limit_kes ?? "150000"}
          onChange={(v) => update("daily_withdrawal_limit_kes", v)}
          prefix="KSh"
        />
        <ConfigField
          label="Minimum Deposit"
          description="Minimum KES amount for M-Pesa deposits."
          value={config.min_deposit_kes ?? "10"}
          onChange={(v) => update("min_deposit_kes", v)}
          prefix="KSh"
        />
        <ConfigField
          label="Minimum Withdrawal"
          description="Minimum KES amount for M-Pesa withdrawals."
          value={config.min_withdrawal_kes ?? "10"}
          onChange={(v) => update("min_withdrawal_kes", v)}
          prefix="KSh"
        />
      </div>

      {/* M-Pesa */}
      <div className="bg-bg-surface border border-border rounded-2xl px-4">
        <p className="font-syne font-semibold text-sm text-text-primary py-3 border-b border-border">
          M-Pesa Configuration
        </p>
        <ConfigField
          label="Paybill Number"
          description="Your Safaricom Paybill number shown to users."
          value={config.paybill_number ?? ""}
          onChange={(v) => update("paybill_number", v)}
        />
        <ConfigField
          label="Display Name"
          description="Business name shown on the M-Pesa STK push prompt."
          value={config.mpesa_display_name ?? "KryptoKe"}
          onChange={(v) => update("mpesa_display_name", v)}
        />
      </div>

      {isDirty && (
        <div className="sticky bottom-4">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="w-full py-4 rounded-2xl bg-primary font-outfit font-semibold text-base text-bg shadow-glow disabled:opacity-60 active:opacity-85 transition-all"
          >
            {save.isPending ? "Saving changes..." : "Save All Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
