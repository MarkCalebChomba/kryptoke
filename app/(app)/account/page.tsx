"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAppStore } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PinPad } from "@/components/auth/PinPad";
import { TopBar } from "@/components/shared/TopBar";
import {
  TotpSetupSheet, TotpDisableSheet, PhoneUpdateSheet,
  AntiPhishingSheet, LoginActivitySheet, KycSheet, WhitelistSheet,
} from "@/components/shared/SecuritySheets";
import { apiPatch, apiPost, apiGet } from "@/lib/api/client";
import { getUserInitials, maskPhone } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import {
  IconChevronRight, IconCopy, IconShield, IconGlobe, IconDownload,
  IconLock, IconHelp, IconChart, IconGift, IconUsers,
  IconEdit, IconApi, IconFlag, IconCheck,
} from "@/components/icons";

/* ─── Shared row component ───────────────────────────────────────────────── */

function SettingRow({ icon: Icon, label, value, onClick, valueClass, badge, enabled }: {
  icon?: React.FC<{ size?: number; className?: string }>;
  label: string;
  value?: string;
  onClick: () => void;
  valueClass?: string;
  badge?: string;
  enabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 w-full active:bg-bg-surface2 transition-colors"
    >
      {Icon && (
        <div className="w-8 h-8 rounded-xl bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
          <Icon size={15} className={enabled ? "text-primary" : "text-text-secondary"} />
        </div>
      )}
      <span className="flex-1 text-left font-outfit text-sm text-text-primary">{label}</span>
      {badge && (
        <span className="font-outfit text-[10px] font-bold text-primary border border-primary/30 px-2 py-0.5 rounded-full mr-1">
          {badge}
        </span>
      )}
      {value && (
        <span className={cn("font-outfit text-sm text-text-muted mr-1", valueClass)}>{value}</span>
      )}
      {enabled !== undefined && enabled && (
        <IconCheck size={14} className="text-primary mr-1" />
      )}
      <IconChevronRight size={15} className="text-text-muted flex-shrink-0" />
    </button>
  );
}

/* ─── Roadmap card (replaces generic ComingSoonSheet for true future features) */

function RoadmapCard({ title, description, eta, onClose }: {
  title: string; description: string; eta?: string; onClose: () => void;
}) {
  return (
    <div className="px-4 pb-6">
      <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            stroke="#F0B429" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="font-syne font-bold text-base text-text-primary mb-2">{title}</h3>
      <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-4">{description}</p>
      {eta && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === 1 ? "bg-primary" : "bg-border-2"}`} />
            ))}
          </div>
          <span className="font-outfit text-xs text-text-muted">Expected: {eta}</span>
        </div>
      )}
      <button onClick={onClose} className="btn-primary">Got it</button>
    </div>
  );
}

function RoadmapSheet({ isOpen, onClose, title, description, eta }: {
  isOpen: boolean; onClose: () => void;
  title: string; description: string; eta?: string;
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title} showCloseButton>
      <RoadmapCard title="" description={description} eta={eta} onClose={onClose} />
    </BottomSheet>
  );
}

/* ─── Change password sheet ──────────────────────────────────────────────── */

function ChangePasswordSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(next)) { setError("Must include an uppercase letter"); return; }
    if (!/[0-9]/.test(next)) { setError("Must include a number"); return; }
    setLoading(true);
    try {
      await apiPatch("/auth/password", { currentPassword: current, newPassword: next, confirmPassword: next });
      toast.success("Password changed");
      onClose(); setCurrent(""); setNext("");
    } catch { setError("Current password is incorrect or something went wrong."); }
    finally { setLoading(false); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Change Password" showCloseButton>
      <form onSubmit={handleSubmit} className="px-4 pb-6 space-y-3">
        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5">
            <p className="text-down font-outfit text-sm">{error}</p>
          </div>
        )}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1">Current password</label>
          <input type="password" autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} className="input-field" placeholder="••••••••" />
        </div>
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1">New password</label>
          <input type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} className="input-field"
            placeholder="Min. 8 chars, uppercase, number" />
        </div>
        <button type="submit" disabled={loading || !current || !next} className="btn-primary">
          {loading ? "Saving..." : "Change Password"}
        </button>
      </form>
    </BottomSheet>
  );
}

/* ─── Asset PIN sheet ────────────────────────────────────────────────────── */

function AssetPinSheet({ isOpen, onClose, hasPin }: {
  isOpen: boolean; onClose: () => void; hasPin: boolean;
}) {
  const toast = useToastActions();
  const updateUser = useAppStore((s) => s.updateUser);
  const [step, setStep] = useState<"current" | "new" | "confirm">(hasPin ? "current" : "new");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleComplete(pin: string) {
    setError(null);
    if (step === "current") { setCurrentPin(pin); setStep("new"); return; }
    if (step === "new")     { setNewPin(pin);     setStep("confirm"); return; }
    if (step === "confirm") {
      if (pin !== newPin) { setError("PINs do not match"); setStep("new"); setNewPin(""); return; }
      setLoading(true);
      try {
        await apiPost("/auth/asset-pin", { pin, currentPin: hasPin ? currentPin : undefined });
        updateUser({ assetPinSet: true });
        toast.success("Asset PIN set");
        onClose();
      } catch { setError("Could not set PIN. Please try again."); setStep("new"); }
      finally { setLoading(false); }
    }
  }

  const titles: Record<typeof step, string> = {
    current: "Enter current PIN",
    new: "Set new PIN",
    confirm: "Confirm new PIN",
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-4 py-2">
        <PinPad onComplete={handleComplete} onCancel={onClose}
          title={titles[step]}
          subtitle={step === "confirm" ? "Re-enter your new PIN" : ""}
          error={error} isLoading={loading} />
      </div>
    </BottomSheet>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */


/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function AccountPage() {
  const router = useRouter();
  const toast = useToastActions();
  const { user, clearAuth } = useAuth();
  const clearStore = useAppStore((s) => s.clearAuth);
  const updateUser = useAppStore((s) => s.updateUser);
  const qc = useQueryClient();

  /* sheets */
  const [changePwOpen,    setChangePwOpen]    = useState(false);
  const [pinOpen,         setPinOpen]         = useState(false);
  const [totpSetupOpen,   setTotpSetupOpen]   = useState(false);
  const [totpDisableOpen, setTotpDisableOpen] = useState(false);
  const [phoneOpen,       setPhoneOpen]       = useState(false);
  const [phishingOpen,    setPhishingOpen]    = useState(false);
  const [sessionsOpen,    setSessionsOpen]    = useState(false);
  const [kycOpen,         setKycOpen]         = useState(false);
  const [whitelistOpen,   setWhitelistOpen]   = useState(false);
  const [roadmap, setRoadmap] = useState<{ open: boolean; title: string; description: string; eta?: string }>({
    open: false, title: "", description: "",
  });

  /* gamify data */
  const { data: gamifyData } = useQuery({
    queryKey: ["gamify", "me"],
    queryFn: () => apiGet<{
      level: string; totalXp: number; xpToNext: number | null; badges: Array<{ id: string; label: string; icon: string; earned: boolean }>;
    }>("/gamify/me"),
    staleTime: 60_000,
  });

  /* notification prefs */
  const { data: notifPrefsData } = useQuery({
    queryKey: ["account", "notif-prefs"],
    queryFn: () => apiGet<{ data: Record<string, boolean> }>("/account/notification-preferences"),
    staleTime: 30_000,
  });
  const notifPrefs = notifPrefsData?.data ?? {};
  const toggleNotifPref = useMutation({
    mutationFn: (update: Record<string, boolean>) => apiPatch("/account/notification-preferences", update),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", "notif-prefs"] }),
    onError: () => toast.error("Could not save preference"),
  });

  /* theme */
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("_kk_theme") as "dark" | "light" | "system") ?? "dark";
  });
  function applyTheme(next: "dark" | "light" | "system") {
    setTheme(next);
    localStorage.setItem("_kk_theme", next);
    const html = document.documentElement;
    if (next === "light") { html.classList.remove("dark"); html.classList.add("light"); }
    else if (next === "dark") { html.classList.remove("light"); html.classList.add("dark"); }
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      html.classList.toggle("dark", prefersDark);
      html.classList.toggle("light", !prefersDark);
    }
  }

  /* language */
  const [langSaving, setLangSaving] = useState(false);
  async function saveLanguage(lang: "en" | "sw") {
    if (lang === user?.language) return;
    setLangSaving(true);
    try {
      await apiPatch("/auth/profile", { language: lang });
      updateUser({ language: lang });
      toast.success("Language preference saved");
    } catch { toast.error("Could not save language"); }
    finally { setLangSaving(false); }
  }

  function copyUid() { navigator.clipboard.writeText(user?.uid ?? ""); toast.copied(); }

  async function handleSignOut() {
    try { await apiPost("/auth/logout"); } catch { /* non-fatal */ }
    if (typeof window !== "undefined") {
      localStorage.removeItem("_kk_s1");
      localStorage.removeItem("_kk_s2");
    }
    clearStore();
    router.replace("/auth/login");
  }

  if (!user) return null;

  const initials = getUserInitials(user.displayName, user.email);
  const isKycVerified = user.kycStatus === "verified";
  const isKycPending  = user.kycStatus === "submitted";
  const level    = gamifyData?.level ?? "Bronze";
  const totalXp  = gamifyData?.totalXp ?? 0;
  const xpToNext = gamifyData?.xpToNext ?? null;
  const xpProgress = xpToNext != null ? Math.min(100, Math.round((totalXp % xpToNext === 0 && totalXp > 0 ? 100 : (totalXp / (totalXp + xpToNext)) * 100))) : 100;

  const LEVEL_COLORS: Record<string, string> = {
    Bronze: "#CD7F32", Silver: "#C0C0C0", Gold: "#F0B429",
    Platinum: "#00E5B4", Diamond: "#60A5FA",
  };
  const levelColor = LEVEL_COLORS[level] ?? "#F0B429";

  /* Security score */
  const securityPoints = [user.assetPinSet, user.totpEnabled, !!user.phone, user.antiPhishingSet, isKycVerified].filter(Boolean).length;
  const securityPct   = securityPoints / 5;
  const securityColor = securityPct >= 0.8 ? "#00D68F" : securityPct >= 0.5 ? "#F0B429" : "#FF4560";
  const securityLabel = securityPct >= 0.8 ? "Strong" : securityPct >= 0.5 ? "Moderate" : "Weak";

  /* Row helper */
  function Row({ label, value, valueClass, onClick, rightEl }: {
    label: string; value?: string; valueClass?: string;
    onClick?: () => void; rightEl?: React.ReactNode;
  }) {
    return (
      <button onClick={onClick ?? (() => {})} disabled={!onClick}
        className={cn("flex items-center justify-between px-4 py-3.5 w-full", onClick && "active:bg-bg-surface2 transition-colors")}>
        <span className="font-outfit text-sm text-text-primary">{label}</span>
        <div className="flex items-center gap-2">
          {rightEl}
          {value && <span className={cn("font-outfit text-sm text-text-muted", valueClass)}>{value}</span>}
          {onClick && <IconChevronRight size={15} className="text-text-muted" />}
        </div>
      </button>
    );
  }

  /* Toggle helper */
  function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle}
        className={cn("relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0", value ? "bg-primary" : "bg-border-2")}>
        <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200", value ? "left-5" : "left-0.5")} />
      </button>
    );
  }

  function SectionHeader({ title }: { title: string }) {
    return <p className="font-syne font-semibold text-xs text-text-muted uppercase tracking-wider px-4 pt-5 pb-1">{title}</p>;
  }

  return (
    <div className="screen overflow-y-auto">
      <TopBar title="Profile" showBack onBack={() => router.back()} />

      {/* ── Profile card ──────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4 card space-y-4">
        {/* Avatar row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden">
              {user.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <span className="font-syne font-bold text-3xl text-primary">{initials}</span>}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-bg-surface border border-border flex items-center justify-center">
              <IconEdit size={12} className="text-text-secondary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-syne font-bold text-lg text-text-primary truncate">
              {user.displayName ?? user.email.split("@")[0]}
            </p>
            <p className="font-outfit text-xs text-text-muted truncate">{user.email}</p>
            {user.phone && <p className="font-outfit text-xs text-text-muted">{maskPhone(user.phone)}</p>}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "font-outfit text-[10px] font-bold px-2.5 py-1 rounded-full border",
            isKycVerified ? "text-primary border-primary/30"
              : isKycPending ? "text-gold border-gold/30"
              : "text-text-muted border-border"
          )}>
            {isKycVerified ? "✓ Verified" : isKycPending ? "Under Review" : "Unverified"}
          </span>
          <span className="font-outfit text-[10px] font-bold px-2.5 py-1 rounded-full border"
            style={{ color: levelColor, borderColor: levelColor + "50" }}>
            {level}
          </span>
          <button onClick={copyUid} className="flex items-center gap-1 font-price text-[9px] text-text-muted border border-border rounded-full px-2 py-1">
            {user.uid.slice(0, 12)}… <IconCopy size={9} />
          </button>
        </div>

        {/* XP progress */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-outfit text-[10px] text-text-muted">
              {totalXp.toLocaleString()} XP
              {xpToNext != null && <span className="text-text-muted"> · {xpToNext.toLocaleString()} to next level</span>}
            </span>
            <span className="font-outfit text-[10px] font-semibold" style={{ color: levelColor }}>{level}</span>
          </div>
          <div className="h-1.5 bg-bg-surface2 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${xpProgress}%`, background: levelColor }} />
          </div>
        </div>

        {/* Member since */}
        <p className="font-outfit text-[10px] text-text-muted">
          Member since {new Date(user.createdAt).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* ── Security ──────────────────────────────────────────────────────── */}
      <SectionHeader title="Security" />
      <div className="mx-4 border border-border rounded-2xl overflow-hidden divide-y divide-border/50 bg-bg-surface">
        {/* Security score bar */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <span className="font-outfit text-xs text-text-muted">Security level</span>
              <span className="font-outfit text-xs font-semibold" style={{ color: securityColor }}>{securityLabel}</span>
            </div>
            <div className="h-1.5 bg-bg-surface2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${securityPct * 100}%`, background: securityColor }} />
            </div>
          </div>
          <span className="font-price text-xs font-bold flex-shrink-0" style={{ color: securityColor }}>
            {securityPoints}/5
          </span>
        </div>
        <Row label="Asset PIN" value={user.assetPinSet ? "Set ✓" : "Not set"} valueClass={user.assetPinSet ? "text-primary" : "text-gold"} onClick={() => setPinOpen(true)} />
        <Row label="Authenticator (2FA)" value={user.totpEnabled ? "Enabled ✓" : "Not set up"} valueClass={user.totpEnabled ? "text-primary" : "text-gold"} onClick={() => user.totpEnabled ? setTotpDisableOpen(true) : setTotpSetupOpen(true)} />
        <Row label="Password" onClick={() => setChangePwOpen(true)} />
        <Row label="Phone number" value={user.phone ? maskPhone(user.phone) : "Not set"} valueClass={user.phone ? undefined : "text-gold"} onClick={() => setPhoneOpen(true)} />
        <Row label="Anti-phishing code" value={user.antiPhishingSet ? "Set ✓" : "Not set"} valueClass={user.antiPhishingSet ? "text-primary" : "text-gold"} onClick={() => setPhishingOpen(true)} />
        <Row label="Login activity" onClick={() => setSessionsOpen(true)} />
        <Row label="Withdrawal whitelist" onClick={() => setWhitelistOpen(true)} />
        <Row label="Identity (KYC)" value={isKycVerified ? "Verified ✓" : isKycPending ? "Under review" : "Not verified"} valueClass={isKycVerified ? "text-primary" : "text-gold"} onClick={() => setKycOpen(true)} />
      </div>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <SectionHeader title="Notifications" />
      <div className="mx-4 border border-border rounded-2xl overflow-hidden divide-y divide-border/50 bg-bg-surface">
        {[
          { key: "email", label: "Email notifications" },
          { key: "sms",   label: "SMS notifications" },
          { key: "push",  label: "Push notifications" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3.5">
            <span className="font-outfit text-sm text-text-primary">{label}</span>
            <Toggle
              value={notifPrefs[key] !== false}
              onToggle={() => toggleNotifPref.mutate({ [key]: !(notifPrefs[key] !== false) })}
            />
          </div>
        ))}
      </div>

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      <SectionHeader title="Preferences" />
      <div className="mx-4 border border-border rounded-2xl overflow-hidden divide-y divide-border/50 bg-bg-surface">
        {/* Language */}
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-outfit text-sm text-text-primary">Language</span>
            {langSaving && <span className="font-outfit text-[10px] text-text-muted">Saving…</span>}
          </div>
          <div className="flex gap-2">
            {(["en", "sw"] as const).map((lang) => (
              <button key={lang} onClick={() => saveLanguage(lang)}
                className={cn("flex-1 py-1.5 rounded-xl border font-outfit text-xs font-semibold transition-all",
                  user.language === lang ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {lang === "en" ? "English" : "Swahili"}
              </button>
            ))}
          </div>
          {user.language === "sw" && (
            <p className="font-outfit text-[10px] text-text-muted mt-1.5">Kiswahili interface coming in Q4 2025 ✓</p>
          )}
        </div>
        {/* Appearance */}
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-outfit text-sm text-text-primary">Appearance</span>
            <span className="font-outfit text-sm text-text-muted capitalize">{theme}</span>
          </div>
          <div className="flex gap-2">
            {(["dark", "light", "system"] as const).map((t) => (
              <button key={t} onClick={() => applyTheme(t)}
                className={cn("flex-1 py-1.5 rounded-xl border font-outfit text-xs font-semibold capitalize transition-all",
                  theme === t ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <SectionHeader title="Account" />
      <div className="mx-4 border border-border rounded-2xl overflow-hidden divide-y divide-border/50 bg-bg-surface">
        <Row label="API Access" onClick={() => router.push("/account/api")} />
        <Row label="Referral program" onClick={() => router.push("/referral")} />
        <Row label="Rewards" onClick={() => router.push("/rewards")} />
        <Row label="Support" onClick={() => router.push("/support")} />
      </div>

      {/* ── Legal ─────────────────────────────────────────────────────────── */}
      <SectionHeader title="Legal" />
      <div className="mx-4 border border-border rounded-2xl overflow-hidden divide-y divide-border/50 bg-bg-surface">
        <Row label="Privacy Policy" onClick={() => router.push("/privacy")} />
        <Row label="Terms of Use"   onClick={() => router.push("/terms")} />
      </div>

      {/* ── Sign out ──────────────────────────────────────────────────────── */}
      <div className="mx-4 mt-5 mb-10">
        <button onClick={handleSignOut}
          className="w-full py-3.5 rounded-2xl border border-down/30 bg-down/5 font-outfit font-semibold text-sm text-down active:opacity-80 transition-opacity">
          Sign Out
        </button>
      </div>

      {/* ── All sheets ────────────────────────────────────────────────────── */}
      <ChangePasswordSheet    isOpen={changePwOpen}    onClose={() => setChangePwOpen(false)} />
      <AssetPinSheet          isOpen={pinOpen}         onClose={() => setPinOpen(false)} hasPin={user.assetPinSet} />
      <TotpSetupSheet         isOpen={totpSetupOpen}   onClose={() => setTotpSetupOpen(false)} />
      <TotpDisableSheet       isOpen={totpDisableOpen} onClose={() => setTotpDisableOpen(false)} />
      <PhoneUpdateSheet       isOpen={phoneOpen}       onClose={() => setPhoneOpen(false)} />
      <AntiPhishingSheet      isOpen={phishingOpen}    onClose={() => setPhishingOpen(false)} />
      <LoginActivitySheet     isOpen={sessionsOpen}    onClose={() => setSessionsOpen(false)} />
      <KycSheet               isOpen={kycOpen}         onClose={() => setKycOpen(false)} />
      <WhitelistSheet         isOpen={whitelistOpen}   onClose={() => setWhitelistOpen(false)} />
      <RoadmapSheet
        isOpen={roadmap.open}
        onClose={() => setRoadmap(r => ({ ...r, open: false }))}
        title={roadmap.title} description={roadmap.description} eta={roadmap.eta}
      />
    </div>
  );
}
