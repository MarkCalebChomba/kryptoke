"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconKryptoKeLogo, IconEye, IconEyeOff, IconChevronLeft, IconCheck,
} from "@/components/icons";
import { OtpInput } from "@/components/auth/OtpInput";
import { apiPost } from "@/lib/api/client";
import { setStoredToken } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";
import { isValidKenyanPhone } from "@/lib/utils/formatters";
import { COUNTRY_OPTIONS } from "@/lib/utils/currency";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import type { User } from "@/types";

type Step = "details" | "verify-email" | "verify-phone";

interface RegisterResponse { uid: string; message: string; requiresEmailVerification: boolean; }
interface VerifyEmailResponse { user: User; accessToken: string; }

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        strokeDasharray="31.416" strokeDashoffset="23.562" strokeLinecap="round" opacity="0.3" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        strokeDasharray="31.416" strokeDashoffset="23.562" strokeLinecap="round"
        className="origin-center" />
    </svg>
  );
}

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["details", "verify-email", "verify-phone"];
  const current = steps.indexOf(step);
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {steps.map((s, i) => (
        <div key={s} className={cn("rounded-full transition-all duration-300",
          i <= current ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-border-2")} />
      ))}
    </div>
  );
}

function DetailsStep({ onSuccess }: { onSuccess: (email: string, phone: string) => void }) {
  const toast = useToastActions();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [countryCode, setCountryCode] = useState("KE");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordStrength = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passwordStrength] ?? "";
  const strengthColor = ["", "bg-down", "bg-gold", "bg-primary", "bg-up"][passwordStrength] ?? "";
  const strengthText = ["", "text-down", "text-gold", "text-primary", "text-up"][passwordStrength] ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError("Enter a valid email address"); return; }
    if (!phone.trim() || !isValidKenyanPhone(phone)) { setError("Enter a valid Kenyan number (e.g. 0712345678 or 0110000000)"); return; }
    if (!password || password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(password)) { setError("Password must include an uppercase letter"); return; }
    if (!/[0-9]/.test(password)) { setError("Password must include a number"); return; }

    setIsLoading(true);
    try {
      await apiPost<RegisterResponse>("/auth/register", { email, phone, password, countryCode, ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}) });
      toast.success("Account created", "Check your email for a verification code");
      onSuccess(email, phone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Clean backend errors for user
      if (msg.includes("already exists") || msg.includes("already taken")) {
        setError("An account with this email already exists. Try signing in.");
      } else if (msg.includes("phone")) {
        setError("This phone number is already linked to an account.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3">
          <p className="text-down font-outfit text-sm">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="block font-outfit text-sm text-text-secondary mb-1.5">Email address</label>
        <input id="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="input-field" placeholder="you@example.com" disabled={isLoading} />
      </div>

      <div>
        <label htmlFor="country" className="block font-outfit text-sm text-text-secondary mb-1.5">Country</label>
        <div className="relative">
          <select
            id="country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            disabled={isLoading}
            className="input-field appearance-none pr-10 cursor-pointer"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <p className="text-text-muted font-outfit text-xs mt-1">Used to show local currency and payment options</p>
      </div>

      <div>
        <label htmlFor="phone" className="block font-outfit text-sm text-text-secondary mb-1.5">Phone number</label>
        <input id="phone" type="tel" inputMode="numeric"
          value={phone} onChange={(e) => setPhone(e.target.value)}
          className="input-field" placeholder="0712 345 678 or 0110 000 000" disabled={isLoading} />
        <p className="text-text-muted font-outfit text-xs mt-1">Safaricom or Airtel — used for M-Pesa</p>
      </div>

      <div>
        <label htmlFor="password" className="block font-outfit text-sm text-text-secondary mb-1.5">Password</label>
        <div className="relative">
          <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-field pr-12" placeholder="Min. 8 characters, 1 uppercase, 1 number" disabled={isLoading} />
          <button type="button" onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 tap-target text-text-muted" tabIndex={-1}>
            {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        </div>
        {password.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[1,2,3,4].map((i) => (
                <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300",
                  i <= passwordStrength ? strengthColor : "bg-border")} />
              ))}
            </div>
            <p className={cn("text-xs font-outfit", strengthText)}>{strengthLabel}</p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="referral" className="block font-outfit text-sm text-text-secondary mb-1.5">Referral code <span className="text-text-muted">(optional)</span></label>
        <input id="referral" type="text" autoCapitalize="characters" spellCheck={false}
          value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          className="input-field" placeholder="e.g. KK-ABC123" disabled={isLoading} />
      </div>

      <p className="text-text-muted font-outfit text-xs leading-relaxed">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-primary">Terms of Use</Link>
        {" "}and{" "}
        <Link href="/privacy" className="text-primary">Privacy Policy</Link>
      </p>

      <button type="submit" disabled={isLoading} className="btn-primary mt-2">
        {isLoading ? <span className="flex items-center justify-center gap-2"><Spinner />Creating account...</span> : "Create Account"}
      </button>
    </form>
  );
}

function VerifyEmailStep({ email, onSuccess, onResend }: {
  email: string; onSuccess: (user: User, token: string) => void; onResend: () => Promise<void>;
}) {
  const toast = useToastActions();
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function handleOtpComplete(otp: string) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiPost<VerifyEmailResponse>("/auth/verify-email", { email, otp });
      toast.success("Email verified");
      onSuccess(data.user, data.accessToken);
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await onResend();
      toast.info("Code resent", `A new code was sent to ${email}`);
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((c) => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
      }, 1000);
    } catch {
      toast.error("Could not resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"
            stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="22,6 12,13 2,6" stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-syne font-bold text-lg text-text-primary mb-1 text-center">Check your email</h2>
      <p className="text-text-muted font-outfit text-sm text-center mb-6 leading-relaxed">
        We sent a 6-digit code to <span className="text-text-secondary font-medium">{email}</span>
      </p>
      <OtpInput onComplete={handleOtpComplete} isLoading={isLoading} error={error} />
      <button onClick={handleResend} disabled={resendCooldown > 0 || isResending}
        className="mt-6 text-sm font-outfit text-text-secondary disabled:text-text-muted transition-colors">
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : isResending ? "Sending..." : "Resend code"}
      </button>
    </div>
  );
}

function VerifyPhoneStep({ phone, onSuccess, onSkip }: { phone: string; onSuccess: () => void; onSkip: () => void; }) {
  const toast = useToastActions();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setIsSending(true);
    try {
      await apiPost("/auth/otp/send", { type: "phone", identifier: phone });
      setSent(true);
      toast.info("SMS sent", "Enter the code from your phone");
    } catch {
      toast.error("Could not send SMS. You can verify your phone later in Settings.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleOtpComplete(otp: string) {
    setIsLoading(true);
    setError(null);
    try {
      await apiPost("/auth/verify-phone", { phone, otp });
      toast.success("Phone verified");
      onSuccess();
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.7 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.61 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.59a16 16 0 006.5 6.5l.96-.96a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
            stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-syne font-bold text-lg text-text-primary mb-1 text-center">Verify your phone</h2>
      <p className="text-text-muted font-outfit text-sm text-center mb-6 leading-relaxed">
        Required for M-Pesa deposits and withdrawals
      </p>
      {!sent ? (
        <div className="w-full space-y-3">
          <div className="card-2 text-center">
            <p className="text-text-secondary font-outfit text-sm">Sending code to</p>
            <p className="text-text-primary font-price text-base mt-0.5">{phone}</p>
          </div>
          <button onClick={sendCode} disabled={isSending} className="btn-primary">
            {isSending ? <span className="flex items-center justify-center gap-2"><Spinner />Sending...</span> : "Send SMS Code"}
          </button>
          <button onClick={onSkip} className="btn-secondary text-text-muted text-sm">Skip for now</button>
        </div>
      ) : (
        <div className="w-full">
          <OtpInput onComplete={handleOtpComplete} isLoading={isLoading} error={error} />
          <button onClick={onSkip} className="mt-6 w-full text-center text-sm font-outfit text-text-muted">Skip for now</button>
        </div>
      )}
    </div>
  );
}

function SuccessScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center py-4">
      <div className="w-20 h-20 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-5">
        <IconCheck size={36} className="text-up" />
      </div>
      <h2 className="font-syne font-bold text-xl text-text-primary mb-2 text-center">You are all set</h2>
      <p className="text-text-muted font-outfit text-sm text-center mb-8 leading-relaxed max-w-xs">
        Your KryptoKe account is ready. Start by depositing via M-Pesa or exploring the markets.
      </p>
      <button onClick={onContinue} className="btn-primary max-w-xs w-full">Go to KryptoKe</button>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const toast = useToastActions();

  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  function handleDetailsSuccess(e: string, p: string) { setEmail(e); setPhone(p); setStep("verify-email"); }
  function handleEmailVerified(user: User, token: string) { setStoredToken(token); setUser(user, token); setStep("verify-phone"); }
  async function handleResendEmail() { await apiPost("/auth/otp/send", { type: "email", identifier: email }); }
  function handlePhoneVerified() { setIsComplete(true); }
  function handlePhoneSkipped() { toast.info("You can verify your phone later in Settings"); setIsComplete(true); }
  // After success screen "Go to KryptoKe", show onboarding wizard
  function handleContinue() { setShowOnboarding(true); }
  function handleOnboardingComplete() { router.replace("/"); }

  const stepTitles: Record<Step, string> = { details: "Create account", "verify-email": "Verify email", "verify-phone": "Verify phone" };

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}
      <div className="flex-1 flex flex-col px-6 pt-safe pt-6 pb-10">
        {!isComplete && (
          <div className="flex items-center mb-6">
            <button onClick={() => { if (step === "details") router.back(); else if (step === "verify-email") setStep("details"); else setStep("verify-email"); }}
              className="tap-target text-text-muted hover:text-text-secondary transition-colors -ml-2" aria-label="Back">
              <IconChevronLeft size={24} />
            </button>
            <h1 className="font-syne font-bold text-lg text-text-primary ml-2">{stepTitles[step]}</h1>
          </div>
        )}

        {step === "details" && (
          <div className="flex items-center gap-3 mb-6">
            <IconKryptoKeLogo size={36} />
            <div>
              <p className="font-syne font-bold text-base text-text-primary">KryptoKe</p>
              <p className="font-outfit text-xs text-text-muted">Kenya&apos;s crypto exchange</p>
            </div>
          </div>
        )}

        {!isComplete && <StepDots step={step} />}

        {isComplete ? <SuccessScreen onContinue={handleContinue} />
          : step === "details" ? <DetailsStep onSuccess={handleDetailsSuccess} />
          : step === "verify-email" ? <VerifyEmailStep email={email} onSuccess={handleEmailVerified} onResend={handleResendEmail} />
          : <VerifyPhoneStep phone={phone} onSuccess={handlePhoneVerified} onSkip={handlePhoneSkipped} />}

        {step === "details" && (
          <p className="text-center font-outfit text-sm text-text-muted mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary font-medium">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
