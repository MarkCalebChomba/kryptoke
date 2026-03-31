"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useAppStore } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PinPad } from "@/components/auth/PinPad";
import { TopBar } from "@/components/shared/TopBar";
import {
  TotpSetupSheet, TotpDisableSheet, PhoneUpdateSheet,
  AntiPhishingSheet, LoginActivitySheet, KycSheet, WhitelistSheet,
} from "@/components/shared/SecuritySheets";
import { apiPatch, apiPost } from "@/lib/api/client";
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

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToastActions();
  const { user, clearAuth } = useAuth();
  const clearStore = useAppStore((s) => s.clearAuth);

  const defaultTab = (searchParams.get("tab") ?? "profile") as "profile" | "security" | "preferences";
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "preferences">(defaultTab);

  /* real feature sheets */
  const [changePwOpen,   setChangePwOpen]   = useState(false);
  const [pinOpen,        setPinOpen]        = useState(false);
  const [totpSetupOpen,  setTotpSetupOpen]  = useState(false);
  const [totpDisableOpen,setTotpDisableOpen]= useState(false);
  const [phoneOpen,      setPhoneOpen]      = useState(false);
  const [phishingOpen,   setPhishingOpen]   = useState(false);
  const [sessionsOpen,   setSessionsOpen]   = useState(false);
  const [kycOpen,        setKycOpen]        = useState(false);
  const [whitelistOpen,  setWhitelistOpen]  = useState(false);

  /* roadmap sheets for genuine future features */
  const [roadmap, setRoadmap] = useState<{ open: boolean; title: string; description: string; eta?: string }>({
    open: false, title: "", description: "",
  });
  function showRoadmap(title: string, description: string, eta?: string) {
    setRoadmap({ open: true, title, description, eta });
  }

  function copyUid() {
    navigator.clipboard.writeText(user?.uid ?? "");
    toast.copied();
  }

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

  const initials      = getUserInitials(user.displayName, user.email);
  const isKycVerified = user.kycStatus === "verified";
  const isKycPending  = user.kycStatus === "submitted";

  /* ── Dynamic security score ─────────────────────────────────────────────── */
  const securityPoints = [
    user.assetPinSet,
    user.totpEnabled,
    !!user.phone,
    user.antiPhishingSet,
    isKycVerified,
  ].filter(Boolean).length;
  const securityMax = 5;
  const securityPct = securityPoints / securityMax;
  const securityColor = securityPct >= 0.8 ? "#00D68F" : securityPct >= 0.5 ? "#F0B429" : "#FF4560";
  const securityLabel = securityPct >= 0.8 ? "Strong" : securityPct >= 0.5 ? "Moderate" : "Weak";
  const circumference = 2 * Math.PI * 22; // r=22
  const dashOffset    = circumference * (1 - securityPct);

  return (
    <div className="screen">
      <TopBar title="Account" showBack onBack={() => router.back()} />

      {/* Avatar + name */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
        <button
          onClick={() => showRoadmap("Edit Profile", "Update your display name and profile picture.", "Q3 2025")}
          className="relative flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden">
            {user.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : <span className="font-syne font-bold text-2xl text-primary">{initials}</span>}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-bg-surface border border-border flex items-center justify-center">
            <IconEdit size={10} className="text-text-secondary" />
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-syne font-bold text-base text-text-primary truncate">
            {user.displayName ?? user.email.split("@")[0]}
          </p>
          <p className="font-outfit text-xs text-text-muted truncate">{user.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "text-[10px] font-outfit font-bold px-2 py-0.5 rounded-full border",
              isKycVerified ? "text-primary border-primary/30"
                : isKycPending ? "text-gold border-gold/30"
                : "text-text-muted border-border"
            )}>
              {isKycVerified ? "Verified" : isKycPending ? "Under review" : "Unverified"}
            </span>
            <button onClick={copyUid} className="flex items-center gap-1 text-text-muted">
              <span className="font-price text-[9px]">{user.uid.slice(0, 12)}…</span>
              <IconCopy size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["profile", "security", "preferences"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-3 font-outfit text-sm font-medium transition-colors border-b-2 capitalize",
              activeTab === tab
                ? "text-text-primary border-primary"
                : "text-text-muted border-transparent"
            )}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Profile tab ─────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div>
          <div className="px-4 pt-4 pb-2">
            <p className="font-syne font-semibold text-sm text-text-primary">Account Information</p>
          </div>
          <div className="divide-y divide-border/50">
            <button
              onClick={copyUid}
              className="flex items-center justify-between px-4 py-3 w-full active:bg-bg-surface2"
            >
              <span className="font-outfit text-sm text-text-primary">UID</span>
              <div className="flex items-center gap-2">
                <span className="font-price text-xs text-text-muted">{user.uid.slice(0, 16)}...</span>
                <IconCopy size={13} className="text-text-muted" />
              </div>
            </button>

            <SettingRow
              icon={IconShield}
              label="Identity verification"
              value={isKycVerified ? "Verified" : isKycPending ? "Under review" : "Not verified"}
              valueClass={isKycVerified ? "text-primary" : isKycPending ? "text-gold" : "text-gold"}
              onClick={() => setKycOpen(true)}
            />

            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
                <IconGlobe size={15} className="text-text-secondary" />
              </div>
              <span className="flex-1 font-outfit text-sm text-text-primary">Country / Region</span>
              <span className="font-outfit text-sm text-text-muted">Kenya</span>
            </div>

            <SettingRow
              icon={IconChart} label="Trading fee tier" value="Regular user"
              onClick={() => showRoadmap("Fee Tiers", "Volume-based fee tiers unlock at $10,000 monthly trading volume.", "Q4 2025")}
            />
          </div>

          <div className="px-4 pt-4 pb-2 border-t border-border mt-2">
            <p className="font-syne font-semibold text-sm text-text-primary">Shortcuts</p>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
            {[
              {
                icon: IconHelp, label: "Get Help",
                action: () => showRoadmap("Live Support", "24/7 live chat and email support is coming soon. For now, check the FAQ or reach us on Telegram.", "Q3 2025"),
              },
              {
                icon: IconChart, label: "Demo Trade",
                action: () => showRoadmap("Demo Trading", "Practice trading with virtual funds before going live. No real money at risk.", "Q4 2025"),
              },
              {
                icon: IconGift, label: "Referral",
                action: () => {
                  navigator.clipboard.writeText(`https://kryptoke.com/ref/${user.uid.slice(0, 8)}`);
                  toast.success("Referral link copied");
                },
              },
              {
                icon: IconFlag, label: "Campaigns",
                action: () => showRoadmap("Campaigns", "Earn bonus rewards through trading competitions and promotional campaigns.", "Q4 2025"),
              },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} onClick={action}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-bg-surface2 border border-border active:scale-95 transition-transform">
                <Icon size={18} className="text-text-secondary" />
                <span className="font-outfit text-[10px] text-text-muted text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border mt-2 divide-y divide-border/50">
            <SettingRow icon={IconChart} label="Analysis" onClick={() => router.push("/analysis")} />
            <SettingRow
              icon={IconUsers} label="Community"
              onClick={() => showRoadmap("Community", "Join KryptoKe discussions, get trading signals, and connect with other Kenyan traders.", "Q3 2025")}
            />
            <SettingRow
              icon={IconDownload} label="Account statement"
              onClick={() => showRoadmap("Account Statement", "Download a full PDF statement of your transaction history for tax reporting.", "Q3 2025")}
            />
            <SettingRow
              icon={IconApi} label="API Access"
              onClick={() => showRoadmap("API Access", "Integrate KryptoKe with your own trading bots using our REST API. Full documentation coming soon.", "Q1 2026")}
              badge="SOON"
            />
            <SettingRow icon={IconHelp} label="FAQ" onClick={() => router.push("/faq")} />
            <SettingRow icon={IconHelp} label="About KryptoKe" onClick={() => router.push("/about")} />
          </div>

          <div className="px-4 pt-4 pb-8 border-t border-border mt-2">
            <button
              onClick={handleSignOut}
              className="w-full py-3.5 rounded-2xl border border-down/30 bg-down/5 font-outfit font-semibold text-sm text-down active:opacity-80 transition-opacity"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ── Security tab ────────────────────────────────────────────────────── */}
      {activeTab === "security" && (
        <div>
          {/* Dynamic security score gauge */}
          <div className="mx-4 mt-4 card border-border bg-bg-surface2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-outfit text-sm text-text-muted">Security level</p>
                <p className="font-syne font-bold text-base mt-0.5" style={{ color: securityColor }}>
                  {securityLabel}
                </p>
                <p className="font-outfit text-xs text-text-muted mt-1 leading-relaxed">
                  {securityPoints}/{securityMax} protection methods active
                </p>
              </div>
              <div className="relative w-14 h-14 flex-shrink-0">
                <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#1C2840" strokeWidth="5" />
                  <circle cx="28" cy="28" r="22" fill="none" stroke={securityColor} strokeWidth="5"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-price text-xs font-bold" style={{ color: securityColor }}>
                    {securityPoints}/{securityMax}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pt-4 pb-2">
            <p className="font-syne font-semibold text-sm text-text-primary">Authentication</p>
          </div>
          <div className="divide-y divide-border/50">
            <SettingRow
              label="Authenticator app (2FA)"
              value={user.totpEnabled ? "Enabled" : "Not set up"}
              valueClass={user.totpEnabled ? "text-primary" : "text-gold"}
              enabled={user.totpEnabled}
              onClick={() => user.totpEnabled ? setTotpDisableOpen(true) : setTotpSetupOpen(true)}
            />
            <SettingRow
              label="Phone number"
              value={user.phone ? maskPhone(user.phone) : "Not set"}
              valueClass={user.phone ? undefined : "text-gold"}
              onClick={() => setPhoneOpen(true)}
            />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex-1 font-outfit text-sm text-text-primary">Email</span>
              <span className="font-outfit text-sm text-text-muted truncate max-w-[200px]">{user.email}</span>
            </div>
            <SettingRow icon={IconLock} label="Login password" onClick={() => setChangePwOpen(true)} />
          </div>

          <div className="px-4 pt-4 pb-2 border-t border-border mt-2">
            <p className="font-syne font-semibold text-sm text-text-primary">Advanced</p>
          </div>
          <div className="divide-y divide-border/50">
            <SettingRow
              icon={IconLock}
              label="Asset PIN"
              value={user.assetPinSet ? "Set" : "Not set"}
              valueClass={user.assetPinSet ? "text-primary" : "text-gold"}
              enabled={user.assetPinSet}
              onClick={() => setPinOpen(true)}
            />
            <SettingRow
              label="Anti-phishing code"
              value={user.antiPhishingSet ? "Set" : "Not set"}
              valueClass={user.antiPhishingSet ? "text-primary" : "text-gold"}
              enabled={user.antiPhishingSet}
              onClick={() => setPhishingOpen(true)}
            />
            <SettingRow
              label="Login activity"
              onClick={() => setSessionsOpen(true)}
            />
            <SettingRow
              label="Withdrawal whitelist"
              onClick={() => setWhitelistOpen(true)}
            />
          </div>
        </div>
      )}

      {/* ── Preferences tab ─────────────────────────────────────────────────── */}
      {activeTab === "preferences" && (
        <div className="divide-y divide-border/50">
          <SettingRow
            icon={IconGlobe} label="Language"
            value={user.language === "sw" ? "Swahili" : "English"}
            onClick={() => showRoadmap("Language", "Switch between English and Swahili. Kiswahili interface coming soon.", "Q4 2025")}
          />
          <SettingRow
            label="Currency" value="KES"
            onClick={() => showRoadmap("Currency Display", "Choose whether values display in KES, USD, or both.", "Q4 2025")}
          />
          <SettingRow
            label="Appearance" value="Dark"
            onClick={() => showRoadmap("Appearance", "Light mode and system-default theme options coming soon.", "Q4 2025")}
          />
          <SettingRow
            label="Notifications"
            onClick={() => showRoadmap("Notifications", "Manage push, email, and SMS notification preferences per event type.", "Q3 2025")}
          />
          <SettingRow label="Privacy Policy" onClick={() => router.push("/privacy")} />
          <SettingRow label="Terms of Use"   onClick={() => router.push("/terms")}   />
        </div>
      )}

      {/* ── All sheets ──────────────────────────────────────────────────────── */}
      <ChangePasswordSheet    isOpen={changePwOpen}    onClose={() => setChangePwOpen(false)} />
      <AssetPinSheet          isOpen={pinOpen}         onClose={() => setPinOpen(false)}        hasPin={user.assetPinSet} />
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
        title={roadmap.title}
        description={roadmap.description}
        eta={roadmap.eta}
      />
    </div>
  );
}
