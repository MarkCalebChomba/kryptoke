"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPatch } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface NotifCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  canDisable: boolean;
  channels: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
}

const DEFAULT_CATEGORIES: NotifCategory[] = [
  {
    id: "security",
    title: "Security Alerts",
    description: "Login attempts, password changes, withdrawal confirmations",
    icon: "🔒",
    canDisable: false,
    channels: { push: true, email: true, sms: true },
  },
  {
    id: "transactions",
    title: "Transaction Updates",
    description: "Deposit confirmations, withdrawal status, trade fills",
    icon: "💸",
    canDisable: true,
    channels: { push: true, email: true, sms: false },
  },
  {
    id: "price_alerts",
    title: "Price Alerts",
    description: "Notifications when coins hit your set price targets",
    icon: "🔔",
    canDisable: true,
    channels: { push: true, email: false, sms: false },
  },
  {
    id: "market_news",
    title: "Market & System News",
    description: "New coin listings, platform updates, scheduled maintenance",
    icon: "📢",
    canDisable: true,
    channels: { push: true, email: true, sms: false },
  },
  {
    id: "earn",
    title: "Earn & Rewards",
    description: "Interest credited, staking rewards, promotional offers",
    icon: "💰",
    canDisable: true,
    channels: { push: true, email: false, sms: false },
  },
  {
    id: "futures",
    title: "Futures & Trading",
    description: "Position updates, funding payments, liquidation warnings",
    icon: "📊",
    canDisable: true,
    channels: { push: true, email: false, sms: false },
  },
  {
    id: "promotions",
    title: "Promotions & Events",
    description: "Trading competitions, bonus campaigns, referral rewards",
    icon: "🎁",
    canDisable: true,
    channels: { push: false, email: true, sms: false },
  },
  {
    id: "newsletter",
    title: "Newsletter",
    description: "Weekly crypto insights and KryptoKe product updates",
    icon: "📰",
    canDisable: true,
    channels: { push: false, email: false, sms: false },
  },
];

/* ─── Toggle ──────────────────────────────────────────────────────────── */
function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
        on ? "bg-primary" : "bg-border-2",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      aria-label="toggle">
      <div className={cn(
        "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
        on ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  );
}

/* ─── Category Row ──────────────────────────────────────────────────────── */
function CategoryRow({
  category,
  onToggleChannel,
}: {
  category: NotifCategory;
  onToggleChannel: (channel: "push" | "email" | "sms", val: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const anyEnabled = category.channels.push || category.channels.email || category.channels.sms;

  return (
    <div className="border-b border-border/40 last:border-0">
      {/* Main row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 w-full px-4 py-3.5 active:bg-bg-surface2 transition-colors text-left">
        <span className="text-xl flex-shrink-0">{category.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-outfit text-sm font-medium text-text-primary">{category.title}</p>
          <p className="font-outfit text-[10px] text-text-muted mt-0.5 leading-tight line-clamp-1">{category.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!category.canDisable && (
            <span className="font-outfit text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-lg">Always on</span>
          )}
          {anyEnabled ? (
            <span className="font-outfit text-[10px] text-up bg-up/10 px-2 py-0.5 rounded-lg">On</span>
          ) : (
            <span className="font-outfit text-[10px] text-text-muted bg-bg-surface2 px-2 py-0.5 rounded-lg">Off</span>
          )}
          <span className={cn("text-text-muted text-sm transition-transform", expanded && "rotate-180")}>▼</span>
        </div>
      </button>

      {/* Channel toggles */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-2">
          {(["push", "email", "sms"] as const).map(channel => (
            <div key={channel} className="flex items-center justify-between py-1.5">
              <div>
                <p className="font-outfit text-sm font-medium text-text-primary capitalize">
                  {channel === "push" ? "App Push" : channel === "sms" ? "SMS" : "Email"}
                </p>
                <p className="font-outfit text-[10px] text-text-muted">
                  {channel === "push" ? "Instant in-app and mobile" : channel === "sms" ? "Text message" : "Email notification"}
                </p>
              </div>
              <Toggle
                on={category.channels[channel]}
                disabled={!category.canDisable && channel !== "sms"}
                onChange={v => onToggleChannel(channel, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function NotificationsPage() {
  const toast = useToastActions();
  const router = useRouter();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [dirty, setDirty] = useState(false);

  // Load saved prefs from server
  const { data: prefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => apiGet<Record<string, boolean>>("/account/notification-preferences"),
    staleTime: 60_000,
  });

  // Sync server prefs into local state
  useEffect(() => {
    if (!prefs) return;
    setCategories(prev => prev.map(cat => {
      const push  = prefs[`${cat.id}_push`]  ?? cat.channels.push;
      const email = prefs[`${cat.id}_email`] ?? cat.channels.email;
      const sms   = prefs[`${cat.id}_sms`]   ?? cat.channels.sms;
      return { ...cat, channels: { push, email, sms } };
    }));
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, boolean>) => apiPatch("/account/notification-preferences", payload),
    onSuccess: () => { toast.success("Preferences saved"); setDirty(false); },
    onError:   () => toast.error("Save failed", "Please try again"),
  });

  function updateChannel(id: string, channel: "push" | "email" | "sms", val: boolean) {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, channels: { ...c.channels, [channel]: val } } : c
    ));
    setDirty(true);
  }

  function saveAll() {
    const payload: Record<string, boolean> = {};
    categories.forEach(cat => {
      payload[`${cat.id}_push`]  = cat.channels.push;
      payload[`${cat.id}_email`] = cat.channels.email;
      payload[`${cat.id}_sms`]   = cat.channels.sms;
    });
    saveMutation.mutate(payload);
  }

  return (
    <div className="screen">
      <TopBar title="Notifications" showBack />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="font-outfit text-xs text-text-muted">
          Choose which notifications to receive and how. Security alerts are always enabled and cannot be turned off.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-border">
        <button
          onClick={() => setCategories(prev => prev.map(c =>
            c.canDisable ? { ...c, channels: { push: true, email: true, sms: false } } : c
          ))}
          className="flex-1 py-1.5 rounded-lg bg-bg-surface2 border border-border font-outfit text-xs text-text-muted active:bg-bg-surface text-center">
          Enable All
        </button>
        <button
          onClick={() => setCategories(prev => prev.map(c =>
            c.canDisable ? { ...c, channels: { push: false, email: false, sms: false } } : c
          ))}
          className="flex-1 py-1.5 rounded-lg bg-bg-surface2 border border-border font-outfit text-xs text-text-muted active:bg-bg-surface text-center">
          Disable All
        </button>
      </div>

      {/* Category list */}
      <div className="border border-border rounded-xl overflow-hidden mx-4 mt-4">
        {categories.map(cat => (
          <CategoryRow
            key={cat.id}
            category={cat}
            onToggleChannel={(ch, v) => updateChannel(cat.id, ch, v)}
          />
        ))}
      </div>

      {/* Price alerts shortcut */}
      <div className="mx-4 mt-3">
        <button
          onClick={() => router.push("/alerts")}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-bg-surface active:bg-bg-surface2">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎯</span>
            <div className="text-left">
              <p className="font-outfit text-sm font-medium text-text-primary">Manage Price Alerts</p>
              <p className="font-outfit text-[10px] text-text-muted">Set custom price targets for any coin</p>
            </div>
          </div>
          <span className="text-text-muted">→</span>
        </button>
      </div>

      {/* Save */}
      <div className="px-4 mt-4 mb-8">
        <button
          onClick={saveAll}
          disabled={!dirty || saveMutation.isPending}
          className={cn("btn-primary disabled:opacity-50", !dirty && "opacity-50")}>
          {saveMutation.isPending ? "Saving..." : dirty ? "Save Preferences" : "Up to date ✓"}
        </button>
      </div>
    </div>
  );
}
