"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet } from "@/lib/api/client";
import { IconCopy, IconCheck, IconUsers, IconGift, IconChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

interface ReferralStats {
  referralCode: string;
  totalReferred: number;
  totalEarned: string;
  pendingEarned: string;
  commissionRate: number;
  referrals: Array<{
    id: string;
    maskedId: string;
    joinedAt: string;
    kycStatus: "none" | "basic" | "full";
    tradingVolume30d: string;
    commissionEarned: string;
  }>;
}

const HOW_IT_WORKS = [
  { step: "1", title: "Share your code",    desc: "Share your unique referral link or code with friends" },
  { step: "2", title: "Friend registers",   desc: "Your friend signs up using your code" },
  { step: "3", title: "They trade",         desc: "Every time they trade, you earn 20% of their trading fee" },
  { step: "4", title: "You get paid",       desc: "Commissions are credited to your wallet daily" },
];

export default function ReferralPage() {
  const toast = useToastActions();
  const { user } = useAuth();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [tab, setTab] = useState<"overview" | "history">("overview");

  const { data: statsData, isLoading } = useQuery({
    queryKey: ["referral", "stats"],
    queryFn: () => apiGet<ReferralStats>("/referral/stats"),
    staleTime: 60_000,
  });

  const stats: ReferralStats = statsData ?? {
    referralCode: "...",
    totalReferred: 0,
    totalEarned: "0",
    pendingEarned: "0",
    commissionRate: 20,
    referrals: [],
  };
  const referralLink = `https://kryptoke.com/register?ref=${stats.referralCode}`;

  async function copy(type: "code" | "link") {
    const text = type === "code" ? stats.referralCode : referralLink;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
    toast.success(type === "code" ? "Code copied!" : "Link copied!");
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: "Join KryptoKe",
        text: "Join me on KryptoKe — Kenya's crypto exchange. Use my code for exclusive benefits!",
        url: referralLink,
      }).catch(() => undefined);
    } else {
      await copy("link");
    }
  }

  const kycBadge = (status: string) => {
    if (status === "full")  return <span className="text-[9px] font-outfit bg-up/15 text-up px-1.5 py-0.5 rounded font-semibold">Verified</span>;
    if (status === "basic") return <span className="text-[9px] font-outfit bg-gold/15 text-gold px-1.5 py-0.5 rounded font-semibold">Basic KYC</span>;
    return <span className="text-[9px] font-outfit bg-border text-text-muted px-1.5 py-0.5 rounded">Unverified</span>;
  };

  return (
    <div className="screen">
      <TopBar title="Referral Program" showBack />

      {/* Hero card */}
      <div className="mx-4 mt-4 card" style={{ background: "linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)", borderColor: "var(--color-primary-20)" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-outfit text-xs text-text-muted">Your Commission Rate</p>
            <p className="font-price text-3xl font-bold text-primary mt-0.5">{stats.commissionRate}%</p>
            <p className="font-outfit text-xs text-text-muted mt-0.5">of every trading fee your friends pay</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <IconGift size={24} className="text-primary" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-surface2 rounded-xl px-3 py-2.5">
            <p className="font-outfit text-[10px] text-text-muted">Total Friends</p>
            <p className="font-price text-lg font-bold text-text-primary">{stats.totalReferred}</p>
          </div>
          <div className="bg-bg-surface2 rounded-xl px-3 py-2.5">
            <p className="font-outfit text-[10px] text-text-muted">Total Earned</p>
            <p className="font-price text-lg font-bold text-up">${stats.totalEarned}</p>
          </div>
        </div>
      </div>

      {/* Referral code card */}
      <div className="mx-4 mt-3 card">
        <p className="font-outfit text-xs text-text-muted mb-2">Your Referral Code</p>
        <div className="flex items-center gap-2 bg-bg-surface2 border border-primary/30 rounded-xl px-4 py-3 mb-3">
          <span className="flex-1 font-price text-lg font-bold text-primary tracking-widest">{stats.referralCode}</span>
          <button onClick={() => copy("code")} className="tap-target">
            {copied === "code" ? <IconCheck size={18} className="text-up" /> : <IconCopy size={18} className="text-text-muted" />}
          </button>
        </div>
        <p className="font-outfit text-[10px] text-text-muted mb-2 truncate">{referralLink}</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => copy("link")}
            className="py-2.5 rounded-xl border border-border font-outfit text-sm font-semibold text-text-primary flex items-center justify-center gap-2">
            {copied === "link" ? <IconCheck size={14} className="text-up" /> : <IconCopy size={14} />}
            Copy Link
          </button>
          <button onClick={share}
            className="py-2.5 rounded-xl bg-primary font-outfit text-sm font-bold text-bg">
            Share Invite
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-4 mt-4 mb-1 tab-bar">
        <button data-active={tab === "overview"} onClick={() => setTab("overview")} className="tab-item">How it Works</button>
        <button data-active={tab === "history"} onClick={() => setTab("history")} className="tab-item">
          Friends ({stats.totalReferred})
        </button>
      </div>

      {/* ── How it Works ──────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="px-4 pt-3 space-y-3">
          {HOW_IT_WORKS.map(({ step, title, desc }) => (
            <div key={step} className="flex items-start gap-3 p-3 rounded-xl bg-bg-surface border border-border">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <span className="font-price text-sm font-bold text-primary">{step}</span>
              </div>
              <div>
                <p className="font-outfit text-sm font-semibold text-text-primary">{title}</p>
                <p className="font-outfit text-xs text-text-muted mt-0.5">{desc}</p>
              </div>
            </div>
          ))}

          {/* Tier table */}
          <div className="card">
            <p className="font-outfit text-xs font-semibold text-text-primary mb-3">Commission Structure</p>
            <div className="divide-y divide-border/40">
              {[
                { friends: "1–5 friends",  rate: "15%", extra: "Standard" },
                { friends: "6–20 friends", rate: "20%", extra: "Active" },
                { friends: "21+ friends",  rate: "25%", extra: "Pro", highlight: true },
              ].map(({ friends, rate, extra, highlight }) => (
                <div key={friends} className={cn("flex items-center justify-between py-2.5",
                  highlight && "text-primary")}>
                  <div>
                    <p className={cn("font-outfit text-sm font-semibold", highlight ? "text-primary" : "text-text-primary")}>{extra}</p>
                    <p className="font-outfit text-[10px] text-text-muted">{friends}</p>
                  </div>
                  <span className={cn("font-price text-lg font-bold", highlight ? "text-primary" : "text-up")}>{rate}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-bg-surface2">
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              Commissions are paid in USDT and credited within 24 hours of your referee's trade.
              Your referee must complete at least one verified trade for you to earn. There is no
              limit on how much you can earn.
            </p>
          </div>
        </div>
      )}

      {/* ── Friends History ───────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="px-4 pt-3">
          {stats.referrals.length === 0 ? (
            <div className="py-16 text-center">
              <IconUsers size={32} className="text-text-muted mx-auto mb-3" />
              <p className="font-outfit text-sm text-text-muted">No referrals yet</p>
              <p className="font-outfit text-xs text-text-muted mt-1">Share your code to start earning</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/40">
              {/* Pending earnings */}
              {parseFloat(stats.pendingEarned) > 0 && (
                <div className="px-3 py-2.5 bg-gold/5 flex justify-between items-center">
                  <span className="font-outfit text-xs text-gold">Pending commission</span>
                  <span className="font-price text-sm font-bold text-gold">+${stats.pendingEarned}</span>
                </div>
              )}
              {stats.referrals.map((ref) => (
                <div key={ref.id} className="flex items-center gap-3 px-3 py-3 bg-bg-surface">
                  <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
                    <IconUsers size={14} className="text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-outfit text-xs font-medium text-text-primary">{ref.maskedId}</p>
                      {kycBadge(ref.kycStatus)}
                    </div>
                    <p className="font-outfit text-[10px] text-text-muted">
                      Joined {new Date(ref.joinedAt).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                      {parseFloat(ref.tradingVolume30d) > 0 && ` · Vol: $${parseFloat(ref.tradingVolume30d).toLocaleString()}`}
                    </p>
                  </div>
                  <span className={cn("font-price text-sm font-semibold",
                    parseFloat(ref.commissionEarned) > 0 ? "text-up" : "text-text-muted")}>
                    +${ref.commissionEarned}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}
