"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";
import { IconCheck, IconGift } from "@/components/icons";

interface Task {
  id: string; category: "daily" | "new_user" | "event";
  title: string; desc: string; reward: string; rewardAsset: string;
  completed: boolean; claimable: boolean; claimed?: boolean;
  progress?: number; progressMax?: number; ctaLabel: string; ctaPath: string;
}
interface Voucher {
  id: string; type: string; amount: string; asset: string;
  product: string; expiresAt: string; status: "unused" | "used" | "expired";
}
interface BadgeInfo {
  id: string; label: string; icon: string; description: string;
  earned: boolean; earnedAt: string | null;
}
interface GamifyData {
  level: string; totalXp: number; xpToNext: number | null;
  feeDiscount: number; rankWeekly: number | null; rankAlltime: number | null;
  badges: BadgeInfo[]; referrals: number;
}
interface LeaderEntry { rank: number; display_name: string; xp: number; }

const LEVEL_COLORS: Record<string, string> = {
  Bronze: "#CD7F32", Silver: "#C0C0C0", Gold: "#F0B429", Platinum: "#00E5B4", Diamond: "#60A5FA",
};
const LEVEL_ORDER = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
const LEVEL_MIN   = [0, 500, 2000, 10000, 50000];

const STATIC_TASKS: Task[] = [
  { id:"1", category:"daily",    title:"Daily Login",        desc:"Log in today",               reward:"0.10", rewardAsset:"USDT", completed:true,  claimable:false, ctaLabel:"Done",       ctaPath:"/" },
  { id:"2", category:"daily",    title:"Make a Trade",       desc:"Complete one trade today",   reward:"0.50", rewardAsset:"USDT", completed:false, claimable:false, ctaLabel:"Trade now",  ctaPath:"/trade" },
  { id:"3", category:"new_user", title:"Complete KYC",       desc:"Verify your identity",       reward:"2.00", rewardAsset:"USDT", completed:false, claimable:false, ctaLabel:"Verify now", ctaPath:"/account" },
  { id:"4", category:"new_user", title:"First Deposit",      desc:"Make your first deposit",    reward:"1.00", rewardAsset:"USDT", completed:true,  claimable:true,  ctaLabel:"Claim",      ctaPath:"/" },
  { id:"5", category:"new_user", title:"Invite a Friend",    desc:"Share your referral code",   reward:"5.00", rewardAsset:"USDT", completed:false, claimable:false, ctaLabel:"Share code", ctaPath:"/referral" },
  { id:"6", category:"event",    title:"Trade 3x This Week", desc:"Complete 3 trades",          reward:"1.50", rewardAsset:"USDT", completed:false, claimable:false, progress:1, progressMax:3, ctaLabel:"Trade now", ctaPath:"/trade" },
];
const CATEGORY_LABELS: Record<Task["category"], string> = {
  daily:"Daily Tasks", new_user:"New User Tasks", event:"Limited-Time Events",
};

function XPProgressBar({ level, totalXp, xpToNext }: { level:string; totalXp:number; xpToNext:number|null }) {
  const color  = LEVEL_COLORS[level] ?? "#F0B429";
  const idx    = LEVEL_ORDER.indexOf(level);
  const min    = LEVEL_MIN[idx] ?? 0;
  const pct    = xpToNext !== null ? Math.min(100, ((totalXp - min) / xpToNext) * 100) : 100;
  const nextLv = LEVEL_ORDER[idx + 1] ?? null;
  return (
    <div className="card" style={{ borderColor:`${color}30`, background:`linear-gradient(135deg,${color}08 0%,transparent 100%)` }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Level</p>
          <p className="font-syne font-bold text-xl mt-0.5" style={{ color }}>{level}</p>
        </div>
        <div className="text-right">
          <p className="font-outfit text-[10px] text-text-muted">Total XP</p>
          <p className="font-price text-2xl font-bold text-text-primary">{totalXp.toLocaleString()}</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-bg-surface2 overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width:`${pct}%`, background:color }} />
      </div>
      <div className="flex justify-between">
        <span className="font-outfit text-[10px] text-text-muted">{level}</span>
        {nextLv
          ? <span className="font-outfit text-[10px] text-text-muted">{xpToNext?.toLocaleString()} XP to {nextLv}</span>
          : <span className="font-outfit text-[10px]" style={{ color }}>Max level 🎉</span>}
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/40">
        {LEVEL_ORDER.map((lvl, i) => {
          const reached = idx >= i;
          const c = LEVEL_COLORS[lvl]!;
          return (
            <div key={lvl} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center font-outfit text-[9px] font-bold border-2 transition-all"
                style={{ borderColor:reached?c:"var(--color-border)", background:reached?`${c}20`:"transparent", color:reached?c:"var(--color-text-muted)" }}>
                {reached?"✓":i+1}
              </div>
              <span className="font-outfit text-[8px] text-text-muted">{lvl}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RewardsPage() {
  const toast = useToastActions();
  const qc    = useQueryClient();
  const [tab, setTab]         = useState<"xp"|"tasks"|"leaderboard">("xp");
  const [lbPeriod, setLbPeriod] = useState<"weekly"|"alltime">("weekly");
  const [claiming, setClaiming] = useState<string|null>(null);

  const { data: gamify, isLoading: gLoading } = useQuery({
    queryKey: ["gamify","me"],
    queryFn: () => apiGet<GamifyData>("/gamify/me"),
    staleTime: 30_000,
  });
  const { data: lb, isLoading: lbLoading } = useQuery({
    queryKey: ["gamify","leaderboard",lbPeriod],
    queryFn: () => apiGet<{ leaderboard:LeaderEntry[]; myRank:number|null }>(`/gamify/leaderboard?period=${lbPeriod}`),
    staleTime: 60_000, enabled: tab === "leaderboard",
  });
  const { data: rewardsData } = useQuery({
    queryKey: ["rewards","tasks"],
    queryFn: () => apiGet<{ tasks:Task[]; vouchers:Voucher[] }>("/rewards/tasks"),
    staleTime: 30_000, enabled: tab === "tasks",
  });

  const claimMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/rewards/claim/${id}`, {}),
    onSuccess: () => {
      toast.success("Reward claimed!","Check your USDT balance");
      qc.invalidateQueries({ queryKey:["rewards","tasks"] });
      qc.invalidateQueries({ queryKey:["wallet"] });
      setClaiming(null);
    },
    onError: () => { toast.error("Claim failed","Please try again"); setClaiming(null); },
  });

  const serverTasks = rewardsData?.tasks ?? [];
  const tasks = STATIC_TASKS.map((s) => {
    const sv = serverTasks.find((t) => t.id === s.id);
    return sv ? { ...s, completed:sv.completed??s.completed, claimable:(sv.completed && !sv.claimed)??s.claimable } : s;
  });
  const vouchers = rewardsData?.vouchers ?? [];

  const level = gamify?.level ?? "Bronze";
  const color = LEVEL_COLORS[level] ?? "#F0B429";

  return (
    <div className="screen">
      <TopBar title="Rewards" showBack />

      <div className="mx-4 mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor:`${color}40`, background:`${color}10` }}>
          <span className="font-price text-sm font-bold" style={{ color }}>{level}</span>
          <span className="font-outfit text-xs text-text-muted">{gamify?.totalXp?.toLocaleString() ?? "—"} XP</span>
        </div>
        {(gamify?.feeDiscount ?? 0) > 0 && (
          <span className="font-outfit text-[10px] text-up bg-up/10 px-2 py-1 rounded-full">
            {((gamify!.feeDiscount)*100).toFixed(0)}% fee discount ✓
          </span>
        )}
      </div>

      <div className="mx-4 mt-3 mb-1 tab-bar">
        <button data-active={tab==="xp"}          onClick={()=>setTab("xp")}          className="tab-item">Level</button>
        <button data-active={tab==="tasks"}        onClick={()=>setTab("tasks")}        className="tab-item">Tasks</button>
        <button data-active={tab==="leaderboard"} onClick={()=>setTab("leaderboard")} className="tab-item">Leaderboard</button>
      </div>

      {/* ── XP Tab ── */}
      {tab === "xp" && (
        <div className="px-4 pt-3 space-y-4">
          {gLoading ? (
            <div className="space-y-3"><div className="skeleton h-40 rounded-2xl"/><div className="skeleton h-52 rounded-2xl"/></div>
          ) : gamify ? (
            <>
              <XPProgressBar level={level} totalXp={gamify.totalXp} xpToNext={gamify.xpToNext} />
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:"Weekly Rank",  value: gamify.rankWeekly  ? `#${gamify.rankWeekly}`  : "—"},
                  {label:"All-time",     value: gamify.rankAlltime ? `#${gamify.rankAlltime}` : "—"},
                  {label:"Referrals",    value: String(gamify.referrals)},
                ].map(({label,value})=>(
                  <div key={label} className="card text-center py-3">
                    <p className="font-price text-lg font-bold text-text-primary">{value}</p>
                    <p className="font-outfit text-[10px] text-text-muted mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="font-outfit text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Badges ({gamify.badges.filter(b=>b.earned).length}/{gamify.badges.length})
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {gamify.badges.map((b)=>(
                    <div key={b.id} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                      b.earned ? "bg-primary/5 border-primary/20" : "bg-bg-surface2 border-border opacity-45")}>
                      <span className="text-xl leading-none" style={{ filter:b.earned?"none":"grayscale(1)" }}>{b.earned?b.icon:"🔒"}</span>
                      <p className="font-outfit text-[9px] text-center leading-tight text-text-muted line-clamp-2">{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card bg-bg-surface2 space-y-1.5">
                <p className="font-outfit text-xs font-semibold text-text-primary">How to earn XP</p>
                {[["First deposit","+200"],["Every trade","+10"],["P2P sell","+25"],["P2P buy","+15"],["KYC verified","+500"],["Referral KYC","+150"]].map(([a,x])=>(
                  <div key={a} className="flex justify-between">
                    <span className="font-outfit text-xs text-text-muted">{a}</span>
                    <span className="font-price text-xs text-up font-semibold">{x} XP</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-center font-outfit text-sm text-text-muted py-10">Could not load XP data</p>}
        </div>
      )}

      {/* ── Tasks Tab ── */}
      {tab === "tasks" && (
        <div className="px-4 pt-3 space-y-4">
          {(["daily","new_user","event"] as const).map((cat)=>{
            const catTasks = tasks.filter(t=>t.category===cat);
            if (!catTasks.length) return null;
            return (
              <div key={cat}>
                <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
                <div className="space-y-2">
                  {catTasks.map((task)=>(
                    <div key={task.id} className={cn("card flex items-center gap-3", task.completed&&!task.claimable&&"opacity-60")}>
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                        task.completed&&!task.claimable?"bg-up/15":task.claimable?"bg-primary/15 animate-pulse":"bg-bg-surface2 border border-border")}>
                        {task.completed&&!task.claimable?<IconCheck size={16} className="text-up"/>:task.claimable?<IconGift size={16} className="text-primary"/>:<span className="font-price text-xs text-text-muted">{task.id}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-outfit text-sm font-semibold text-text-primary">{task.title}</p>
                        <p className="font-outfit text-[10px] text-text-muted">{task.desc}</p>
                        {task.progress!==undefined && task.progressMax && !task.completed && (
                          <div className="mt-1.5">
                            <div className="h-1 rounded-full bg-bg-surface2 overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60" style={{ width:`${Math.min(100,(task.progress/task.progressMax)*100)}%` }}/>
                            </div>
                            <p className="font-price text-[9px] text-text-muted mt-0.5">{task.progress.toLocaleString()} / {task.progressMax.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-price text-sm font-bold text-up mb-1">+{task.reward} {task.rewardAsset}</p>
                        {task.claimable
                          ? <button onClick={()=>{setClaiming(task.id);claimMutation.mutate(task.id);}} disabled={claiming===task.id}
                              className="px-3 py-1 rounded-lg bg-primary font-outfit text-[10px] font-bold text-bg disabled:opacity-60">
                              {claiming===task.id?"…":"Claim"}</button>
                          : !task.completed
                          ? <a href={task.ctaPath} className="px-3 py-1 rounded-lg border border-border font-outfit text-[10px] text-text-muted">{task.ctaLabel}</a>
                          : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {vouchers.length>0&&(
            <div>
              <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Vouchers</p>
              <div className="space-y-2">
                {vouchers.map(v=>(
                  <div key={v.id} className={cn("card flex items-center gap-3",v.status!=="unused"&&"opacity-50")}>
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-price text-sm font-bold",v.status==="unused"?"bg-primary/15 text-primary":"bg-bg-surface2 text-text-muted")}>{v.amount}{v.asset==="%"?"%":""}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit text-sm font-semibold text-text-primary">{v.type}</p>
                      <p className="font-outfit text-[10px] text-text-muted">{v.product} · Expires {new Date(v.expiresAt).toLocaleDateString("en-KE",{month:"short",day:"numeric"})}</p>
                    </div>
                    <span className={cn("font-outfit text-[9px] font-semibold px-2 py-0.5 rounded-full",v.status==="unused"?"bg-up/15 text-up":v.status==="used"?"bg-border text-text-muted":"bg-down/15 text-down")}>{v.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Leaderboard Tab ── */}
      {tab === "leaderboard" && (
        <div className="px-4 pt-3">
          <div className="flex rounded-xl overflow-hidden border border-border mb-4">
            {(["weekly","alltime"] as const).map(p=>(
              <button key={p} onClick={()=>setLbPeriod(p)}
                className={cn("flex-1 py-2 font-outfit text-xs font-semibold transition-all",lbPeriod===p?"bg-primary/10 text-primary":"text-text-muted")}>
                {p==="weekly"?"This Week":"All Time"}
              </button>
            ))}
          </div>
          {lb?.myRank&&(
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20 mb-3">
              <span className="font-price text-sm font-bold text-primary">#{lb.myRank}</span>
              <span className="font-outfit text-xs text-text-muted">Your current rank</span>
            </div>
          )}
          {lbLoading ? (
            <div className="space-y-2">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
          ) : (
            <div className="border border-border rounded-2xl overflow-hidden">
              {(lb?.leaderboard??[]).map((entry,i)=>{
                const medals=["🥇","🥈","🥉"];
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border/40 last:border-0 bg-bg-surface">
                    <span className="font-price text-sm w-8 text-center shrink-0" style={{ color:i<3?color:"var(--color-text-muted)" }}>
                      {medals[i]??`#${entry.rank}`}
                    </span>
                    <span className="flex-1 font-outfit text-sm text-text-primary truncate">{entry.display_name}</span>
                    <span className="font-price text-xs text-primary font-semibold shrink-0">{entry.xp.toLocaleString()} XP</span>
                  </div>
                );
              })}
              {!(lb?.leaderboard?.length)&&(
                <div className="py-12 text-center">
                  <p className="font-outfit text-sm text-text-muted">No rankings yet</p>
                  <p className="font-outfit text-xs text-text-muted mt-1">Start trading to earn XP</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="h-8"/>
    </div>
  );
}
