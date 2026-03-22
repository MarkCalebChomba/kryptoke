"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useAuth, useAppStore } from "@/lib/store";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";
import { IconCheck, IconX, IconTrash, IconShield, IconAlertTriangle } from "@/components/icons";
import { isValidKenyanPhone, normalizeKenyanPhone } from "@/lib/utils/formatters";

/* ─── TOTP Setup Sheet ──────────────────────────────────────────────────────── */

export function TotpSetupSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const updateUser = useAppStore(s => s.updateUser);
  const [step, setStep] = useState<"qr" | "verify" | "done">("qr");
  const [qrUrl, setQrUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) { setStep("qr"); setCode(""); setError(""); setQrUrl(""); setSecret(""); return; }
    setLoading(true);
    apiPost<{ secret: string; qrDataUrl: string }>("/auth/totp/setup")
      .then(d => { setQrUrl(d.qrDataUrl); setSecret(d.secret); })
      .catch(() => toast.error("Could not start 2FA setup"))
      .finally(() => setLoading(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    if (code.length !== 6) return;
    setLoading(true); setError("");
    try {
      await apiPost("/auth/totp/verify", { code });
      updateUser({ totpEnabled: true });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally { setLoading(false); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Set up Authenticator App" showCloseButton maxHeight="90dvh">
      <div className="px-4 pb-8">
        {step === "qr" && (
          <>
            <p className="font-outfit text-sm text-text-secondary mb-4 leading-relaxed">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app.
            </p>
            {loading ? (
              <div className="w-[160px] h-[160px] skeleton rounded-xl mx-auto mb-4" />
            ) : qrUrl ? (
              <div className="flex flex-col items-center mb-4 gap-3">
                <img src={qrUrl} alt="2FA QR Code" className="w-40 h-40 rounded-xl border border-border" />
                <div className="w-full card-2">
                  <p className="font-outfit text-[10px] text-text-muted mb-1">Or enter manually</p>
                  <p className="font-price text-xs text-text-primary break-all select-all">{secret}</p>
                </div>
              </div>
            ) : null}
            <button onClick={() => setStep("verify")} className="btn-primary" disabled={!qrUrl}>
              I've scanned the QR code
            </button>
          </>
        )}

        {step === "verify" && (
          <>
            <p className="font-outfit text-sm text-text-secondary mb-4 leading-relaxed">
              Enter the 6-digit code from your authenticator app to confirm setup.
            </p>
            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5 mb-3">
                <p className="text-down font-outfit text-sm">{error}</p>
              </div>
            )}
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input-field font-price text-center text-2xl tracking-[0.4em] mb-4"
              placeholder="000000"
              autoFocus
            />
            <button onClick={handleVerify} disabled={code.length !== 6 || loading} className="btn-primary">
              {loading ? "Verifying..." : "Enable 2FA"}
            </button>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-4">
              <IconCheck size={26} className="text-up" />
            </div>
            <h3 className="font-syne font-bold text-lg text-text-primary mb-2">2FA Enabled</h3>
            <p className="font-outfit text-sm text-text-muted mb-6">
              Your account is now protected with two-factor authentication.
            </p>
            <button onClick={onClose} className="btn-primary max-w-xs w-full">Done</button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── TOTP Disable Sheet ────────────────────────────────────────────────────── */

export function TotpDisableSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const updateUser = useAppStore(s => s.updateUser);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!isOpen) { setCode(""); setError(""); } }, [isOpen]);

  async function handleDisable() {
    if (code.length !== 6) return;
    setLoading(true); setError("");
    try {
      await apiDelete(`/auth/totp?code=${code}`);
      updateUser({ totpEnabled: false });
      toast.success("2FA disabled");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally { setLoading(false); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Disable 2FA" showCloseButton>
      <div className="px-4 pb-8">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-down/8 border border-down/20 mb-4">
          <IconAlertTriangle size={16} className="text-down flex-shrink-0 mt-0.5" />
          <p className="font-outfit text-sm text-down leading-relaxed">
            Disabling 2FA reduces your account security. Only do this if you are switching apps.
          </p>
        </div>
        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-down font-outfit text-sm">{error}</p>
          </div>
        )}
        <label className="block font-outfit text-sm text-text-secondary mb-1.5">
          Enter current authenticator code
        </label>
        <input
          type="text" inputMode="numeric" maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input-field font-price text-center text-2xl tracking-[0.4em] mb-4"
          placeholder="000000"
          autoFocus
        />
        <button onClick={handleDisable} disabled={code.length !== 6 || loading}
          className="w-full py-3.5 rounded-2xl border border-down/30 bg-down/5 font-outfit font-semibold text-sm text-down active:opacity-80 transition-opacity disabled:opacity-40">
          {loading ? "Disabling..." : "Disable 2FA"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Phone Update Sheet ────────────────────────────────────────────────────── */

export function PhoneUpdateSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const updateUser = useAppStore(s => s.updateUser);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!isOpen) { setStep("phone"); setPhone(""); setOtp(""); setError(""); setCountdown(0); } }, [isOpen]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSendOtp() {
    if (!isValidKenyanPhone(phone)) return;
    setLoading(true); setError("");
    try {
      await apiPost("/auth/otp/send", { type: "phone", identifier: normalizeKenyanPhone(phone) });
      setStep("otp"); setCountdown(60);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send code"); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    if (otp.length !== 6) return;
    setLoading(true); setError("");
    try {
      const result = await apiPost<{ user: { phone: string } }>("/auth/verify-phone", {
        phone: normalizeKenyanPhone(phone), otp,
      });
      updateUser({ phone: result.user.phone });
      toast.success("Phone updated");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid code"); }
    finally { setLoading(false); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Update Phone Number" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5">
            <p className="text-down font-outfit text-sm">{error}</p>
          </div>
        )}
        {step === "phone" ? (
          <>
            <div>
              <label className="block font-outfit text-sm text-text-secondary mb-1.5">New phone number</label>
              <input type="tel" inputMode="numeric" value={phone}
                onChange={e => setPhone(e.target.value)}
                className={cn("input-field font-price", phone && !isValidKenyanPhone(phone) && "border-down")}
                placeholder="07XX XXX XXX" autoFocus />
              {phone && !isValidKenyanPhone(phone) && (
                <p className="text-down font-outfit text-xs mt-1">Enter a valid Kenyan number</p>
              )}
            </div>
            <button onClick={handleSendOtp} disabled={!isValidKenyanPhone(phone) || loading} className="btn-primary">
              {loading ? "Sending..." : "Send verification code"}
            </button>
          </>
        ) : (
          <>
            <p className="font-outfit text-sm text-text-secondary">
              Enter the 6-digit code sent to <span className="text-text-primary font-price">{phone}</span>
            </p>
            <input type="text" inputMode="numeric" maxLength={6} value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input-field font-price text-center text-2xl tracking-[0.4em]"
              placeholder="000000" autoFocus />
            <button onClick={handleVerify} disabled={otp.length !== 6 || loading} className="btn-primary">
              {loading ? "Verifying..." : "Confirm"}
            </button>
            <button onClick={() => { setStep("phone"); setCountdown(0); }}
              className="w-full font-outfit text-sm text-text-muted text-center py-1">
              Use a different number
            </button>
            {countdown > 0 ? (
              <p className="text-center font-outfit text-xs text-text-muted">Resend in {countdown}s</p>
            ) : (
              <button onClick={handleSendOtp} className="w-full font-outfit text-sm text-primary text-center py-1">
                Resend code
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── Anti-Phishing Code Sheet ──────────────────────────────────────────────── */

export function AntiPhishingSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const updateUser = useAppStore(s => s.updateUser);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!isOpen) { setCode(""); setError(""); } }, [isOpen]);

  async function handleSave() {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) { setError("Code must be at least 4 characters"); return; }
    setLoading(true); setError("");
    try {
      await apiPatch("/auth/anti-phishing", { code: trimmed });
      updateUser({ antiPhishingSet: true });
      toast.success("Anti-phishing code set");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setLoading(false); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Anti-Phishing Code" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <div className="card-2 bg-primary/5 border-primary/20">
          <p className="font-outfit text-sm text-text-secondary leading-relaxed">
            Set a secret word that will appear in every official KryptoKe email. If an email doesn't contain it, treat it as fake.
          </p>
        </div>
        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5">
            <p className="text-down font-outfit text-sm">{error}</p>
          </div>
        )}
        <div>
          <label className="block font-outfit text-sm text-text-secondary mb-1.5">
            Your code (4–20 characters, letters and numbers only)
          </label>
          <input type="text" value={code}
            onChange={e => setCode(e.target.value.slice(0, 20))}
            className="input-field" placeholder="e.g. MyKryptoKe2024"
            autoComplete="off" spellCheck={false} autoFocus />
        </div>
        <button onClick={handleSave} disabled={code.trim().length < 4 || loading} className="btn-primary">
          {loading ? "Saving..." : "Save code"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Login Activity Sheet ──────────────────────────────────────────────────── */

interface LoginSession {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

export function LoginActivitySheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => apiGet<LoginSession[]>("/auth/sessions"),
    staleTime: 30_000,
    enabled: isOpen,
  });

  function parseBrowser(ua: string | null): string {
    if (!ua) return "Unknown browser";
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Mobile")) return "Mobile browser";
    return "Browser";
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await apiDelete(`/auth/sessions/${id}`);
      qc.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.success("Session revoked");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to revoke"); }
    finally { setRevoking(null); }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Login Activity" showCloseButton maxHeight="90dvh">
      <div className="px-4 pb-8">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : !sessions?.length ? (
          <p className="text-center text-text-muted font-outfit text-sm py-8">No sessions found</p>
        ) : (
          <div className="space-y-2 pt-2">
            {sessions.map(session => (
              <div key={session.id}
                className={cn("card-2 flex items-start gap-3", session.is_current && "border-primary/30 bg-primary/5")}>
                <div className="w-8 h-8 rounded-xl bg-bg-surface border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                  <IconShield size={14} className={session.is_current ? "text-primary" : "text-text-muted"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-outfit text-sm text-text-primary">{parseBrowser(session.user_agent)}</p>
                    {session.is_current && (
                      <span className="font-outfit text-[10px] text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="font-outfit text-[10px] text-text-muted truncate">
                    {session.ip_address ?? "IP hidden"}{session.city ? ` · ${session.city}` : ""}{session.country ? `, ${session.country}` : ""}
                  </p>
                  <p className="font-outfit text-[10px] text-text-muted">
                    Last seen {new Date(session.last_seen_at).toLocaleDateString("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.id)}
                    disabled={revoking === session.id}
                    className="tap-target text-text-muted hover:text-down transition-colors flex-shrink-0"
                    aria-label="Revoke session"
                  >
                    {revoking === session.id
                      ? <div className="w-4 h-4 border border-text-muted border-t-transparent rounded-full animate-spin" />
                      : <IconTrash size={15} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── KYC Verification Sheet ────────────────────────────────────────────────── */

export function KycSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const updateUser = useAppStore(s => s.updateUser);
  const [step, setStep] = useState<"intro" | "form" | "submitted">("intro");
  const [docType, setDocType] = useState<"national_id" | "passport" | "drivers_license">("national_id");
  const [frontUrl, setFrontUrl] = useState("");
  const [backUrl, setBackUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) { setStep("intro"); setFrontUrl(""); setBackUrl(""); setSelfieUrl(""); setError(""); }
  }, [isOpen]);

  const { data: existingStatus } = useQuery({
    queryKey: ["kyc", "status"],
    queryFn: () => apiGet<{ status: string; rejection_reason: string | null; submitted_at: string } | null>("/auth/kyc/status"),
    enabled: isOpen,
    staleTime: 60_000,
  });

  async function handleSubmit() {
    if (!frontUrl || !selfieUrl) { setError("Front document and selfie are required"); return; }
    setLoading(true); setError("");
    try {
      await apiPost("/auth/kyc", {
        docType, frontUrl, backUrl: backUrl || undefined, selfieUrl,
      });
      updateUser({ kycStatus: "submitted" });
      setStep("submitted");
    } catch (e) { setError(e instanceof Error ? e.message : "Submission failed"); }
    finally { setLoading(false); }
  }

  const requiresBack = docType === "national_id" || docType === "drivers_license";

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Identity Verification" showCloseButton maxHeight="92dvh">
      <div className="px-4 pb-8">
        {/* Show existing status if already submitted */}
        {existingStatus && existingStatus.status === "pending" && step === "intro" && (
          <div className="card border-gold/30 bg-gold/5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
              <p className="font-syne font-semibold text-sm text-gold">Under Review</p>
            </div>
            <p className="font-outfit text-sm text-text-secondary leading-relaxed">
              Your documents were submitted on{" "}
              {new Date(existingStatus.submitted_at).toLocaleDateString("en-KE", { month: "long", day: "numeric" })}.
              We'll notify you once verified (usually 1–2 business days).
            </p>
          </div>
        )}

        {existingStatus?.status === "rejected" && step === "intro" && (
          <div className="card border-down/30 bg-down/5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <IconX size={14} className="text-down" />
              <p className="font-syne font-semibold text-sm text-down">Verification Rejected</p>
            </div>
            <p className="font-outfit text-sm text-text-secondary leading-relaxed">
              Reason: {existingStatus.rejection_reason ?? "Documents were unclear or invalid. Please resubmit."}
            </p>
          </div>
        )}

        {step === "intro" && (
          <>
            {/* Tier benefits */}
            <div className="space-y-2 mb-5">
              {[
                { label: "Daily M-Pesa withdrawal limit", unverified: "KSh 10,000", verified: "KSh 150,000" },
                { label: "On-chain withdrawal limit", unverified: "$500/day", verified: "$50,000/day" },
                { label: "P2P transfers", unverified: "Restricted", verified: "Full access" },
              ].map(({ label, unverified, verified }) => (
                <div key={label} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                  <span className="flex-1 font-outfit text-sm text-text-secondary">{label}</span>
                  <span className="font-price text-xs text-text-muted line-through">{unverified}</span>
                  <span className="font-price text-xs text-up">{verified}</span>
                </div>
              ))}
            </div>

            {existingStatus?.status !== "pending" && (
              <button onClick={() => setStep("form")} className="btn-primary">
                {existingStatus?.status === "rejected" ? "Resubmit documents" : "Start verification"}
              </button>
            )}
          </>
        )}

        {step === "form" && (
          <>
            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl px-3 py-2.5 mb-4">
                <p className="text-down font-outfit text-sm">{error}</p>
              </div>
            )}

            {/* Document type */}
            <div className="mb-4">
              <label className="block font-outfit text-sm text-text-secondary mb-2">Document type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["national_id", "passport", "drivers_license"] as const).map(type => (
                  <button key={type} onClick={() => setDocType(type)}
                    className={cn(
                      "py-2.5 rounded-xl border font-outfit text-xs font-medium transition-all",
                      docType === type ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted"
                    )}>
                    {type === "national_id" ? "National ID" : type === "passport" ? "Passport" : "Driver's License"}
                  </button>
                ))}
              </div>
            </div>

            {/* URL inputs — in production replace with file upload widget */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block font-outfit text-sm text-text-secondary mb-1.5">
                  Front of document (URL)
                </label>
                <input type="url" value={frontUrl} onChange={e => setFrontUrl(e.target.value)}
                  className="input-field" placeholder="https://..." />
              </div>
              {requiresBack && (
                <div>
                  <label className="block font-outfit text-sm text-text-secondary mb-1.5">
                    Back of document (URL)
                  </label>
                  <input type="url" value={backUrl} onChange={e => setBackUrl(e.target.value)}
                    className="input-field" placeholder="https://..." />
                </div>
              )}
              <div>
                <label className="block font-outfit text-sm text-text-secondary mb-1.5">
                  Selfie holding document (URL)
                </label>
                <input type="url" value={selfieUrl} onChange={e => setSelfieUrl(e.target.value)}
                  className="input-field" placeholder="https://..." />
              </div>
            </div>

            <p className="font-outfit text-xs text-text-muted mb-4 leading-relaxed">
              Upload your documents to a secure storage service (e.g. Supabase Storage) and paste the URLs here. Documents are reviewed by our compliance team within 1–2 business days.
            </p>

            <button onClick={handleSubmit}
              disabled={!frontUrl || !selfieUrl || loading}
              className="btn-primary">
              {loading ? "Submitting..." : "Submit for review"}
            </button>
          </>
        )}

        {step === "submitted" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-4">
              <IconCheck size={26} className="text-up" />
            </div>
            <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Documents Submitted</h3>
            <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6">
              We'll review your documents within 1–2 business days and notify you by email and SMS.
            </p>
            <button onClick={onClose} className="btn-primary max-w-xs w-full">Done</button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── Withdrawal Whitelist Sheet ────────────────────────────────────────────── */

interface WhitelistEntry {
  id: string;
  label: string;
  asset: string;
  chain: string;
  address: string;
  memo: string | null;
  added_at: string;
  usable_from: string;
}

export function WhitelistSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", asset: "USDT", chain: "ETH", address: "", memo: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["auth", "whitelist"],
    queryFn: () => apiGet<WhitelistEntry[]>("/auth/whitelist"),
    enabled: isOpen,
    staleTime: 30_000,
  });

  async function handleAdd() {
    if (!form.label || !form.address) { setError("Label and address are required"); return; }
    setLoading(true); setError("");
    try {
      await apiPost("/auth/whitelist", {
        label: form.label, asset: form.asset, chain: form.chain,
        address: form.address, memo: form.memo || undefined,
      });
      qc.invalidateQueries({ queryKey: ["auth", "whitelist"] });
      toast.success("Address added", "Available after 24-hour cooling period");
      setAdding(false);
      setForm({ label: "", asset: "USDT", chain: "ETH", address: "", memo: "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add"); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await apiDelete(`/auth/whitelist/${id}`);
      qc.invalidateQueries({ queryKey: ["auth", "whitelist"] });
      toast.success("Address removed");
    } catch { toast.error("Failed to remove"); }
    finally { setDeleting(null); }
  }

  const isUsable = (entry: WhitelistEntry) => new Date(entry.usable_from) <= new Date();

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Withdrawal Whitelist" showCloseButton maxHeight="92dvh">
      <div className="px-4 pb-8">
        <p className="font-outfit text-sm text-text-secondary mb-4 leading-relaxed">
          When enabled, withdrawals can only go to whitelisted addresses. New addresses have a 24-hour cooling period before use.
        </p>

        {isLoading ? (
          <div className="space-y-2 mb-4">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : (entries ?? []).length === 0 ? (
          <div className="text-center py-6 mb-4">
            <p className="font-outfit text-sm text-text-muted">No addresses yet</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {entries!.map(entry => (
              <div key={entry.id} className="card-2 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-outfit text-sm text-text-primary">{entry.label}</p>
                    <span className="font-outfit text-[10px] text-text-muted border border-border px-1.5 py-0.5 rounded">
                      {entry.asset} · {entry.chain}
                    </span>
                    {!isUsable(entry) && (
                      <span className="font-outfit text-[10px] text-gold border border-gold/30 px-1.5 py-0.5 rounded">
                        Cooling
                      </span>
                    )}
                  </div>
                  <p className="font-price text-[10px] text-text-muted truncate mt-0.5">{entry.address}</p>
                  {entry.memo && <p className="font-outfit text-[10px] text-text-muted">Memo: {entry.memo}</p>}
                </div>
                <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id}
                  className="tap-target text-text-muted hover:text-down transition-colors flex-shrink-0">
                  {deleting === entry.id
                    ? <div className="w-4 h-4 border border-text-muted border-t-transparent rounded-full animate-spin" />
                    : <IconTrash size={15} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {!adding ? (
          <button onClick={() => setAdding(true)} className="btn-secondary">+ Add address</button>
        ) : (
          <div className="card space-y-3">
            <p className="font-syne font-semibold text-sm text-text-primary">New address</p>
            {error && <p className="text-down font-outfit text-sm">{error}</p>}
            {[
              { key: "label", label: "Label", placeholder: "e.g. My Binance USDT" },
              { key: "address", label: "Address", placeholder: "0x... or wallet address" },
              { key: "memo", label: "Memo / Tag (optional)", placeholder: "For XRP, TON, XLM, NEAR" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block font-outfit text-xs text-text-muted mb-1">{label}</label>
                <input type="text" value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="input-field text-sm" placeholder={placeholder} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "asset", label: "Asset", options: ["USDT", "BTC", "ETH", "BNB", "SOL", "XRP"] },
                { key: "chain", label: "Chain", options: ["ETH", "BSC", "SOL", "XRP", "BTC", "TRX", "TON"] },
              ].map(({ key, label, options }) => (
                <div key={key}>
                  <label className="block font-outfit text-xs text-text-muted mb-1">{label}</label>
                  <select value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="input-field text-sm appearance-none">
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setError(""); }} className="btn-secondary flex-1 py-3">Cancel</button>
              <button onClick={handleAdd} disabled={!form.label || !form.address || loading}
                className="btn-primary flex-1 py-3">
                {loading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
