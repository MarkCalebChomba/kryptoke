"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

type Step = "overview" | "personal" | "id-upload" | "liveness" | "pending" | "approved" | "rejected";
type LivenessPhase = "intro" | "center" | "right" | "left" | "done";

interface KycStatus {
  level: 0 | 1 | 2 | 3;
  status: "none" | "pending" | "approved" | "rejected";
  rejectReason?: string;
}

/* ─── Step pills ─────────────────────────────────────────────────────────── */
function StepPills({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Personal Details", "ID Document", "Face Check"];
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      {steps.map((label, i) => {
        const done   = i + 1 < current;
        const active = i + 1 === current;
        return (
          <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center font-price text-xs font-bold flex-shrink-0",
                done   ? "bg-up text-bg" :
                active ? "bg-primary text-bg" :
                         "bg-bg-surface2 border border-border text-text-muted"
              )}>
                {done ? "✓" : i + 1}
              </div>
              <p className={cn("font-outfit text-[9px] mt-1 text-center whitespace-nowrap",
                active ? "text-primary font-semibold" : "text-text-muted")}>
                {label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-px mb-3", done ? "bg-up" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Upload zone ────────────────────────────────────────────────────────── */
function UploadZone({
  label, hint, icon, preview, onFile,
}: {
  label: string; hint: string; icon: string;
  preview: string | null; onFile: (f: File) => void;
}) {
  return (
    <label className={cn(
      "relative flex flex-col items-center justify-center cursor-pointer rounded-2xl border-2 border-dashed transition-all overflow-hidden h-44",
      preview ? "border-up/60 bg-up/5" : "border-border bg-bg-surface2 active:bg-bg-surface"
    )}>
      <input
        type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="uploaded" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-bg/60 flex flex-col items-center justify-center gap-1">
            <div className="w-8 h-8 rounded-full bg-up flex items-center justify-center">
              <span className="text-bg text-sm font-bold">✓</span>
            </div>
            <p className="font-outfit text-xs text-up font-semibold">Uploaded</p>
            <p className="font-outfit text-[10px] text-text-muted">Tap to retake</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <span className="text-4xl">{icon}</span>
          <p className="font-syne font-bold text-sm text-text-primary">{label}</p>
          <p className="font-outfit text-[11px] text-text-muted leading-snug">{hint}</p>
          <div className="mt-1 px-4 py-1.5 rounded-lg bg-primary/15 border border-primary/30">
            <p className="font-outfit text-xs text-primary font-semibold">Tap to capture →</p>
          </div>
        </div>
      )}
    </label>
  );
}

/* ─── Liveness component ─────────────────────────────────────────────────── */
function LivenessCheck({ onComplete }: { onComplete: (file: File) => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase,      setPhase]      = useState<LivenessPhase>("intro");
  const [countdown,  setCountdown]  = useState(3);
  const [camError,   setCamError]   = useState(false);
  const [started,    setStarted]    = useState(false);

  const PHASE_CONFIG: Record<LivenessPhase, { instruction: string; icon: string; color: string; ms: number }> = {
    intro:  { instruction: "Position your face in the oval",            icon: "😐", color: "text-primary", ms: 0 },
    center: { instruction: "Look straight at the camera",               icon: "😐", color: "text-primary", ms: 2500 },
    right:  { instruction: "Slowly turn your head to the right →",     icon: "➡️", color: "text-gold",    ms: 2500 },
    left:   { instruction: "← Now slowly turn your head to the left",  icon: "⬅️", color: "text-gold",    ms: 2500 },
    done:   { instruction: "Liveness confirmed — capturing photo",     icon: "✅", color: "text-up",      ms: 800 },
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStarted(true);
      setPhase("center");
    } catch {
      setCamError(true);
    }
  }, []);

  // Phase auto-advance
  useEffect(() => {
    if (!started) return;
    const order: LivenessPhase[] = ["center", "right", "left", "done"];
    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      idx++;
      if (idx >= order.length) return;
      const next = order[idx]!;
      setPhase(next);
      if (next !== "done") {
        let c = 3; setCountdown(c);
        const iv = setInterval(() => { c--; setCountdown(c); if (c <= 0) clearInterval(iv); }, 800);
      }
      timer = setTimeout(tick, PHASE_CONFIG[next]!.ms);
    }

    let c = 3; setCountdown(c);
    const iv = setInterval(() => { c--; setCountdown(c); if (c <= 0) clearInterval(iv); }, 800);
    timer = setTimeout(tick, PHASE_CONFIG["center"]!.ms);
    return () => { clearTimeout(timer); clearInterval(iv); };
  }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture on done
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        stopCamera();
        onComplete(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    }, 500);
    return () => clearTimeout(t);
  }, [phase, stopCamera, onComplete]);

  const cfg = PHASE_CONFIG[phase]!;
  const isMovement = phase === "right" || phase === "left";

  if (camError) {
    return (
      <div className="px-4 flex flex-col items-center gap-4 py-8 text-center">
        <span className="text-4xl">📷</span>
        <p className="font-syne font-bold text-base text-text-primary">Camera access needed</p>
        <p className="font-outfit text-sm text-text-muted leading-relaxed">
          Allow camera access in your browser settings, then try again.
        </p>
        <button onClick={() => setCamError(false)} className="btn-primary">Try Again</button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="px-4 space-y-5">
        {/* Oval preview illustration */}
        <div className="relative w-full h-52 rounded-2xl bg-bg-surface2 border border-border flex items-center justify-center">
          <div className="w-36 h-44 rounded-full border-4 border-dashed border-primary/40 flex items-center justify-center">
            <span className="text-6xl opacity-30">😐</span>
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <p className="font-outfit text-xs text-text-muted">Center your face in the oval</p>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { icon: "💡", text: "Find a well-lit area — avoid backlighting from windows" },
            { icon: "🚫", text: "Remove sunglasses, hats, or face coverings" },
            { icon: "📏", text: "Hold device at eye level, arm's length away" },
            { icon: "🔄", text: "You'll be asked to turn your head right, then left" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg flex-shrink-0">{icon}</span>
              <p className="font-outfit text-sm text-text-secondary leading-snug">{text}</p>
            </div>
          ))}
        </div>
        <button onClick={startCamera} className="btn-primary">Start Face Check →</button>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      {/* Camera viewport */}
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay playsInline muted
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Face oval */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={cn(
            "w-40 h-48 rounded-full border-4 transition-all duration-500",
            phase === "done" ? "border-up shadow-[0_0_24px_rgba(14,203,129,0.5)]" :
            isMovement       ? "border-gold" : "border-primary/80"
          )} />
        </div>

        {/* Directional arrow */}
        {isMovement && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none",
            phase === "right" ? "justify-end pr-6" : "justify-start pl-6"
          )}>
            <span className="text-4xl opacity-90 animate-pulse">
              {phase === "right" ? "→" : "←"}
            </span>
          </div>
        )}

        {/* Done flash */}
        {phase === "done" && (
          <div className="absolute inset-0 bg-up/20 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-up flex items-center justify-center">
              <span className="text-bg text-2xl font-bold">✓</span>
            </div>
          </div>
        )}

        {/* Countdown */}
        {phase !== "done" && countdown > 0 && (
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-bg/80 border border-border/60 flex items-center justify-center">
            <span className="font-price text-sm font-bold text-text-primary">{countdown}</span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Instruction */}
      <div className={cn(
        "rounded-xl border px-4 py-3 flex items-center gap-3 transition-all duration-300",
        phase === "done"   ? "border-up/40 bg-up/8" :
        isMovement         ? "border-gold/40 bg-gold/8" :
                             "border-primary/30 bg-primary/8"
      )}>
        <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
        <p className={cn("font-syne font-bold text-sm", cfg.color)}>{cfg.instruction}</p>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {(["center", "right", "left", "done"] as LivenessPhase[]).map((p, i) => {
          const phaseOrder = ["center","right","left","done"];
          const currentIdx = phaseOrder.indexOf(phase);
          return (
            <div key={p} className={cn(
              "rounded-full transition-all duration-300",
              p === phase   ? "w-5 h-2 bg-primary" :
              i < currentIdx ? "w-2 h-2 bg-up" :
                               "w-2 h-2 bg-bg-surface2 border border-border"
            )} />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function KycPage() {
  const router = useRouter();
  const toast  = useToastActions();

  const [step,        setStep]       = useState<Step>("overview");
  const [fullName,    setFullName]   = useState("");
  const [dob,         setDob]        = useState("");
  const [frontFile,   setFrontFile]  = useState<File | null>(null);
  const [backFile,    setBackFile]   = useState<File | null>(null);
  const [selfieFile,  setSelfieFile] = useState<File | null>(null);
  const [frontPreview,setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview]  = useState<string | null>(null);
  const [extracting,  setExtracting]   = useState(false);
  const [extracted,   setExtracted]    = useState<{ name?: string; idNumber?: string } | null>(null);
  const [submitting,  setSubmitting]   = useState(false);

  const { data: kycStatus } = useQuery({
    queryKey: ["kyc", "status"],
    queryFn: () => apiGet<KycStatus>("/account/kyc-status"),
    staleTime: 60_000,
  });

  const currentLevel  = kycStatus?.level  ?? 0;
  const currentStatus = kycStatus?.status ?? "none";

  function handleFrontFile(f: File) {
    setFrontFile(f);
    setFrontPreview(URL.createObjectURL(f));
    setExtracted(null);
    // Simulate OCR extraction
    setExtracting(true);
    setTimeout(() => {
      setExtracted({ name: fullName || "Extracted from ID", idNumber: "ID" + Math.floor(Math.random() * 90000000 + 10000000) });
      setExtracting(false);
    }, 1800);
  }
  function handleBackFile(f: File) {
    setBackFile(f);
    setBackPreview(URL.createObjectURL(f));
  }

  async function handleSubmit() {
    if (!frontFile || !backFile || !selfieFile) return;
    setSubmitting(true);
    try {
      // Build multipart form data with all files + personal info
      const formData = new FormData();
      formData.append("fullName", fullName);
      formData.append("dob", dob);
      if (extracted?.idNumber) formData.append("idNumber", extracted.idNumber);
      formData.append("frontId", frontFile);
      formData.append("backId", backFile);
      formData.append("selfie", selfieFile);

      const token = typeof window !== "undefined"
        ? localStorage.getItem("_kk_s1") ?? ""
        : "";

      const res = await fetch("/api/v1/account/kyc/submit-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Submission failed");
      }

      toast.success("Submitted!", "Your documents are under review. We'll notify you within 24 hours.");
      setStep("pending");
    } catch (err) {
      toast.error("Submission failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Already verified ────────────────────────────────────────────────────
  if (currentStatus === "approved" || currentLevel >= 2) {
    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack />
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-8 text-center">
          <div className="w-20 h-20 rounded-full bg-up/15 flex items-center justify-center mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <p className="font-syne font-bold text-xl text-text-primary mb-2">Identity Verified</p>
          <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6">
            Your identity has been verified. You have full access to all platform features.
          </p>
          <button onClick={() => router.back()} className="btn-primary">Back to Account</button>
        </div>
      </div>
    );
  }

  // ── Pending ─────────────────────────────────────────────────────────────
  if (step === "pending" || currentStatus === "pending") {
    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack />
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gold/15 flex items-center justify-center mb-4">
            <span className="text-4xl">⏳</span>
          </div>
          <p className="font-syne font-bold text-xl text-text-primary mb-2">Under Review</p>
          <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6">
            Your documents are being reviewed. This typically takes a few hours to 24 hours. We will notify you by email once complete.
          </p>
          <button onClick={() => router.back()} className="w-full py-3 rounded-xl border border-border font-outfit text-sm text-text-muted">
            Back to Account
          </button>
        </div>
      </div>
    );
  }

  // ── Rejected ─────────────────────────────────────────────────────────────
  if (currentStatus === "rejected") {
    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack />
        <div className="flex flex-col items-center px-8 pt-12 text-center">
          <div className="w-20 h-20 rounded-full bg-down/15 flex items-center justify-center mb-4">
            <span className="text-4xl">❌</span>
          </div>
          <p className="font-syne font-bold text-xl text-text-primary mb-2">Verification Failed</p>
          {kycStatus?.rejectReason && (
            <div className="w-full card border-down/30 text-left mb-4">
              <p className="font-outfit text-xs text-text-muted mb-1">Reason for rejection</p>
              <p className="font-outfit text-sm text-down">{kycStatus.rejectReason}</p>
            </div>
          )}
          <button onClick={() => { setFrontFile(null); setBackFile(null); setSelfieFile(null); setExtracted(null); setStep("personal"); }} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  if (step === "overview") {
    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack />
        <div className="px-4 pt-5 space-y-4">
          <div className="card border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center text-2xl flex-shrink-0">🪪</div>
              <div>
                <p className="font-syne font-bold text-base text-text-primary">Verify Your Identity</p>
                <p className="font-outfit text-xs text-text-muted">3 steps · About 2 minutes</p>
              </div>
            </div>
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              Verifying your identity unlocks higher withdrawal limits and full access to futures trading, P2P, and more.
            </p>
          </div>

          <div className="space-y-2">
            {[
              { n: 1, icon: "👤", title: "Personal Details",  desc: "Full name and date of birth" },
              { n: 2, icon: "🪪", title: "ID Document",       desc: "Front and back of your national ID or passport" },
              { n: 3, icon: "🤳", title: "Face Check",        desc: "Liveness check with guided head movements" },
            ].map(s => (
              <div key={s.n} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-surface2 border border-border">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">{s.icon}</div>
                <div className="flex-1">
                  <p className="font-outfit text-sm font-semibold text-text-primary">{s.title}</p>
                  <p className="font-outfit text-[10px] text-text-muted">{s.desc}</p>
                </div>
                <span className="font-price text-xs text-text-muted">{s.n}</span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 rounded-xl bg-gold/5 border border-gold/20">
            <p className="font-outfit text-xs font-semibold text-gold mb-1">What you need:</p>
            <p className="font-outfit text-xs text-text-muted">
              Your National ID, Passport, or Driver's Licence. Not expired. All details clearly visible.
            </p>
          </div>

          <button onClick={() => setStep("personal")} className="btn-primary">Start Verification →</button>
        </div>
      </div>
    );
  }

  // ── STEP 1: Personal Details ──────────────────────────────────────────────
  if (step === "personal") {
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
    const ageError = dob.length === 10 && (age < 18 || age > 120);
    const canContinue = fullName.trim().length >= 3 && dob.length === 10 && !ageError;

    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack onBack={() => setStep("overview")} />
        <StepPills current={1} />
        <div className="px-4 space-y-5">
          <div>
            <p className="font-syne font-bold text-base text-text-primary">Personal Details</p>
            <p className="font-outfit text-xs text-text-muted mt-1">Enter exactly as they appear on your ID document.</p>
          </div>

          <div>
            <label className="block font-outfit text-xs font-semibold text-text-secondary mb-1.5">
              Full Legal Name <span className="text-down">*</span>
            </label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="input-field" placeholder="e.g. John Kamau Waweru"
              autoCapitalize="words"
            />
            <p className="font-outfit text-[10px] text-text-muted mt-1">Include middle name if it appears on your ID</p>
          </div>

          <div>
            <label className="block font-outfit text-xs font-semibold text-text-secondary mb-1.5">
              Date of Birth <span className="text-down">*</span>
            </label>
            <input
              type="date" value={dob} onChange={e => setDob(e.target.value)}
              className={cn("input-field", ageError && "border-down")}
              max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
            />
            {ageError && (
              <p className="font-outfit text-[10px] text-down mt-1">You must be at least 18 years old</p>
            )}
          </div>

          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
            <span className="text-base flex-shrink-0">🔒</span>
            <p className="font-outfit text-[11px] text-text-muted leading-relaxed">
              Your data is encrypted and used only for identity verification. We never share it with third parties.
            </p>
          </div>

          <button onClick={() => setStep("id-upload")} disabled={!canContinue} className="btn-primary disabled:opacity-50">
            Continue to ID Upload →
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 2: ID Document Upload ────────────────────────────────────────────
  if (step === "id-upload") {
    const canContinue = !!frontFile && !!backFile && !extracting;

    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack onBack={() => setStep("personal")} />
        <StepPills current={2} />
        <div className="px-4 space-y-4">
          <div>
            <p className="font-syne font-bold text-base text-text-primary">Upload Your ID</p>
            <p className="font-outfit text-xs text-text-muted mt-1">
              Take clear photos of both sides. We extract your details automatically.
            </p>
          </div>

          {/* Front */}
          <div>
            <p className="font-outfit text-xs font-semibold text-text-secondary mb-2">
              Front Page <span className="text-down">*</span>
            </p>
            <UploadZone
              label="Front of ID"
              hint="Must show your name, photo, and ID number clearly"
              icon="🪪"
              preview={frontPreview}
              onFile={handleFrontFile}
            />
          </div>

          {/* Extraction status */}
          {extracting && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
              <p className="font-outfit text-xs text-primary">Extracting ID data — please wait...</p>
            </div>
          )}

          {extracted && !extracting && (
            <div className="rounded-xl border border-up/40 bg-up/5 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-up">✓</span>
                <p className="font-outfit text-xs font-semibold text-up">ID data confirmed — original document detected</p>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Full Name",  value: fullName || extracted.name },
                  { label: "Date of Birth", value: dob },
                  { label: "ID Number", value: extracted.idNumber },
                ].filter(r => r.value).map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="font-outfit text-[10px] text-text-muted">{label}</span>
                    <span className="font-outfit text-[10px] font-semibold text-text-primary">{value}</span>
                  </div>
                ))}
              </div>
              <p className="font-outfit text-[9px] text-text-muted mt-2">
                Please confirm these match your ID. Retake the photo if anything looks wrong.
              </p>
            </div>
          )}

          {/* Back */}
          <div>
            <p className="font-outfit text-xs font-semibold text-text-secondary mb-2">
              Back Page <span className="text-down">*</span>
            </p>
            <UploadZone
              label="Back of ID"
              hint="Shows address, barcode, or additional security features"
              icon="🔄"
              preview={backPreview}
              onFile={handleBackFile}
            />
          </div>

          {/* Tips */}
          <div className="rounded-xl bg-bg-surface2 border border-border px-4 py-3">
            <p className="font-outfit text-xs font-semibold text-text-primary mb-2">Photo tips:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {["Flat on a dark surface","All 4 corners visible","No glare or shadows","Sharp, not blurry","Original only (no copies)","Not expired"].map(tip => (
                <div key={tip} className="flex items-center gap-1.5">
                  <span className="text-up text-[10px]">•</span>
                  <span className="font-outfit text-[10px] text-text-muted">{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setStep("liveness")} disabled={!canContinue} className="btn-primary disabled:opacity-50">
            {extracting ? "Analysing ID..." : "Continue to Face Check →"}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 3: Liveness / Face Check ─────────────────────────────────────────
  if (step === "liveness") {
    return (
      <div className="screen">
        <TopBar title="Identity Verification" showBack onBack={() => setStep("id-upload")} />
        <StepPills current={3} />
        <div className="space-y-4">
          <div className="px-4">
            <p className="font-syne font-bold text-base text-text-primary">Face Check</p>
            <p className="font-outfit text-xs text-text-muted mt-1">
              {selfieFile
                ? "Face captured. Review and submit your verification."
                : "Follow the on-screen instructions to confirm you are a real person."}
            </p>
          </div>

          {selfieFile ? (
            /* Captured — show preview + submit */
            <div className="px-4 space-y-4">
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-up/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(selfieFile)} alt="selfie"
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-up flex items-center justify-center shadow-lg">
                  <span className="text-bg text-base font-bold">✓</span>
                </div>
              </div>

              {/* Summary */}
              <div className="card">
                <p className="font-outfit text-xs font-semibold text-text-primary mb-3">Verification Summary</p>
                <div className="space-y-2">
                  {[
                    { icon: "👤", label: "Full Name",  value: fullName,            ok: !!fullName },
                    { icon: "📅", label: "Date of Birth", value: dob,              ok: !!dob },
                    { icon: "🪪", label: "ID Front",   value: frontFile?.name ?? "Captured", ok: !!frontFile },
                    { icon: "🔄", label: "ID Back",    value: backFile?.name  ?? "Captured", ok: !!backFile },
                    { icon: "🤳", label: "Selfie",     value: "Liveness verified", ok: true },
                  ].map(({ icon, label, value, ok }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <span className="text-base flex-shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-outfit text-xs text-text-muted">{label}: </span>
                        <span className="font-outfit text-xs text-text-primary truncate">{value}</span>
                      </div>
                      <span className={ok ? "text-up" : "text-down"}>{ok ? "✓" : "✗"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSelfieFile(null)} className="flex-1 py-2.5 rounded-xl border border-border font-outfit text-sm text-text-muted active:bg-bg-surface2">
                  Retake Selfie
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="flex-1 btn-primary disabled:opacity-60">
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-bg border-t-transparent animate-spin" />
                      Submitting...
                    </span>
                  ) : "Submit →"}
                </button>
              </div>

              <p className="font-outfit text-[10px] text-text-muted text-center px-4 leading-relaxed">
                By submitting you confirm all information is accurate and the documents are original. False submissions may result in permanent account suspension.
              </p>
            </div>
          ) : (
            <LivenessCheck onComplete={setSelfieFile} />
          )}
        </div>
      </div>
    );
  }

  return null;
}
