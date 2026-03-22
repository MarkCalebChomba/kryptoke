"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useWallet } from "@/lib/hooks/useWallet";
import { useAuth } from "@/lib/store";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";
import { IconCheck, IconGift, IconChevronRight } from "@/components/icons";

interface Task {
  id: string;
  category: "daily" | "new_user" | "event";
  title: string;
  desc: string;
  reward: string;
  rewardAsset: string;
  completed: boolean;
  claimable: boolean;
  expiresAt?: string;
  progress?: number;
  progressMax?: number;
  ctaLabel: string;
  ctaPath: string;
}

interface Voucher {
  id: string;
  type: string;
  amount: string;
  asset: string;
  product: string;
  expiresAt: string;
  status: "unused" | "used" | "expired";
}

const TASKS: Task[] = [
  { id: "1", category: "daily",    title: "Daily Login",        desc: "Log in to KryptoKe today",             reward: "0.10",  rewardAsset: "USDT", completed: true,  claimable: false, ctaLabel: "Done",       ctaPath: "/" },
  { id: "2", category: "daily",    title: "Make a Trade",       desc: "Complete one spot trade today",         reward: "0.50",  rewardAsset: "USDT", completed: false, claimable: false, ctaLabel: "Trade now",  ctaPath: "/trade" },
  { id: "3", category: "new_user", title: "Complete KYC",       desc: "Verify your identity",                  reward: "2.00",  rewardAsset: "USDT", completed: false, claimable: false, ctaLabel: "Verify now", ctaPath: "/account" },
  { id: "4", category: "new_user", title: "First Deposit",      desc: "Make your first M-Pesa deposit",        reward: "1.00",  rewardAsset: "USDT", completed: true,  claimable: true,  ctaLabel: "Claim",      ctaPath: "/" },
  { id: "5", category: "new_user", title: "Invite a Friend",    desc: "Share your referral code",              reward: "5.00",  rewardAsset: "USDT", completed: false, claimable: false, ctaLabel: "Share code", ctaPath: "/referral" },
  { id: "6", category: "event",    title: "Trade 3x This Week", desc: "Complete 3 trades this week",           reward: "1.50",  rewardAsset: "USDT", completed: false, claimable: false, progress: 1, progressMax: 3, ctaLabel: "Trade now", ctaPath: "/trade" },
  { id: "7", category: "event",    title: "Deposit KSh 5,000",  desc: "Deposit KSh 5,000 or more in one go",  reward: "3.00",  rewardAsset: "USDT", completed: false, claimable: false, progress: 2000, progressMax: 5000, ctaLabel: "Deposit", ctaPath: "/deposit" },
];

const VOUCHERS: Voucher[] = [
  { id: "1", type: "Trading Bonus", amount: "1.00", asset: "USDT", product: "Spot Trading", expiresAt: "2025-04-30", status: "unused" },
  { id: "2", type: "Fee Rebate",    amount: "50",   asset: "%",    product: "All trading",  expiresAt: "2025-03-31", status: "used" },
];

const CATEGORY_LABELS: Record<Task["category"], string> = {
  daily:    "Daily Tasks",
  new_user: "New User Tasks",
  event:    "Limited-Time Events",
};

export default function RewardsPage() {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"tasks" | "vouchers">("tasks");
  const [claiming, setClaiming] = useState<string | null>(null);

  const { data: rewardsData, isLoading } = useQuery({
    queryKey: ["rewards", "tasks"],
    queryFn: () => apiGet<{ tasks: Task[]; vouchers: Voucher[] }>("/rewards/tasks"),
    staleTime: 30_000,
  });

  // Merge server data with local static definitions for display
  const serverTasks = rewardsData?.tasks ?? [];
  const tasks = TASKS.map(staticTask => {
    const serverMatch = serverTasks.find(s => s.id === staticTask.id);
    if (serverMatch) {
      return {
        ...staticTask,
        completed: serverMatch.completed ?? staticTask.completed,
        claimable: (serverMatch.completed && !serverMatch.claimed) ?? staticTask.claimable,
      };
    }
    return staticTask;
  });
  const serverVouchers = rewardsData?.vouchers ?? VOUCHERS;

  const totalPending = tasks.filter(t => t.claimable).length;
  const totalCompleted = tasks.filter(t => t.completed).length;

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => apiPost(`/rewards/claim/${taskId}`, {}),
    onSuccess: (_, taskId) => {
      toast.success("Reward claimed!", "Check your USDT balance");
      qc.invalidateQueries({ queryKey: ["rewards", "tasks"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setClaiming(null);
    },
    onError: () => { toast.error("Claim failed", "Please try again"); setClaiming(null); },
  });

  async function claimReward(taskId: string) {
    setClaiming(taskId);
    claimMutation.mutate(taskId);
  }

  const categories = ["daily", "new_user", "event"] as const;

  return (
    <div className="screen">
      <TopBar title="Rewards Center" showBack />

      {/* Summary card */}
      <div className="mx-4 mt-4 card" style={{ background: "linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)", borderColor: "var(--color-primary-20)" }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <IconGift size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-outfit text-xs text-text-muted">Task Progress</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-price text-2xl font-bold text-text-primary">{totalCompleted}</span>
              <span className="font-outfit text-sm text-text-muted">/ {tasks.length} completed</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-bg-surface2 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(totalCompleted / tasks.length) * 100}%` }} />
            </div>
          </div>
          {totalPending > 0 && (
            <div className="flex-shrink-0">
              <span className="font-outfit text-xs font-bold text-primary bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-full">
                {totalPending} to claim
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-4 mt-4 mb-1 tab-bar">
        <button data-active={tab === "tasks"} onClick={() => setTab("tasks")} className="tab-item">
          Tasks {totalPending > 0 && <span className="ml-1 bg-primary text-bg rounded-full font-price text-[9px] px-1.5 py-0.5">{totalPending}</span>}
        </button>
        <button data-active={tab === "vouchers"} onClick={() => setTab("vouchers")} className="tab-item">
          Vouchers ({serverVouchers.filter(v => v.status === "unused").length})
        </button>
      </div>

      {/* ── Tasks Tab ─────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <div className="px-4 pt-3 space-y-4">
          {categories.map(cat => {
            const catTasks = tasks.filter(t => t.category === cat);
            if (catTasks.length === 0) return null;
            return (
              <div key={cat}>
                <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
                <div className="space-y-2">
                  {catTasks.map(task => (
                    <div key={task.id}
                      className={cn("card flex items-center gap-3",
                        task.completed && !task.claimable && "opacity-60")}>
                      {/* Status icon */}
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                        task.completed && !task.claimable ? "bg-up/15" :
                        task.claimable ? "bg-primary/15 animate-pulse" :
                        "bg-bg-surface2 border border-border")}>
                        {task.completed && !task.claimable
                          ? <IconCheck size={16} className="text-up" />
                          : task.claimable
                            ? <IconGift size={16} className="text-primary" />
                            : <span className="font-price text-xs text-text-muted">{task.id}</span>}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-outfit text-sm font-semibold text-text-primary">{task.title}</p>
                        <p className="font-outfit text-[10px] text-text-muted">{task.desc}</p>
                        {task.progress !== undefined && task.progressMax && !task.completed && (
                          <div className="mt-1.5">
                            <div className="h-1 rounded-full bg-bg-surface2 overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60 transition-all"
                                style={{ width: `${Math.min(100, (task.progress / task.progressMax) * 100)}%` }} />
                            </div>
                            <p className="font-price text-[9px] text-text-muted mt-0.5">
                              {task.progress.toLocaleString()} / {task.progressMax.toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Reward + CTA */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-price text-sm font-bold text-up mb-1">
                          +{task.reward} {task.rewardAsset}
                        </p>
                        {task.claimable ? (
                          <button onClick={() => claimReward(task.id)}
                            disabled={claiming === task.id}
                            className="px-3 py-1 rounded-lg bg-primary font-outfit text-[10px] font-bold text-bg disabled:opacity-60">
                            {claiming === task.id ? "..." : "Claim"}
                          </button>
                        ) : !task.completed ? (
                          <a href={task.ctaPath}
                            className="px-3 py-1 rounded-lg border border-border font-outfit text-[10px] text-text-muted">
                            {task.ctaLabel}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Vouchers Tab ──────────────────────────────────────────────── */}
      {tab === "vouchers" && (
        <div className="px-4 pt-3">
          {serverVouchers.length === 0 ? (
            <div className="py-16 text-center">
              <IconGift size={32} className="text-text-muted mx-auto mb-3" />
              <p className="font-outfit text-sm text-text-muted">No vouchers yet</p>
              <p className="font-outfit text-xs text-text-muted mt-1">Complete tasks to earn vouchers</p>
            </div>
          ) : (
            <div className="space-y-2">
              {serverVouchers.map(v => (
                <div key={v.id} className={cn("card flex items-center gap-3",
                  v.status !== "unused" && "opacity-50")}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-price text-sm font-bold",
                    v.status === "unused" ? "bg-primary/15 text-primary" : "bg-bg-surface2 text-text-muted")}>
                    {v.amount}{v.asset === "%" ? "%" : ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit text-sm font-semibold text-text-primary">{v.type}</p>
                    <p className="font-outfit text-[10px] text-text-muted">
                      {v.product} · Expires {new Date(v.expiresAt).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className={cn("font-outfit text-[9px] font-semibold px-2 py-0.5 rounded-full",
                    v.status === "unused"  ? "bg-up/15 text-up" :
                    v.status === "used"    ? "bg-border text-text-muted" :
                    "bg-down/15 text-down")}>
                    {v.status}
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
