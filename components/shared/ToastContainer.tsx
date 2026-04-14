"use client";

import { useEffect, useCallback, useState } from "react";
import { useToast } from "@/lib/store";
import type { ToastMessage } from "@/types";
import { IconCheck, IconX, IconAlertTriangle, IconInfo } from "@/components/icons";
import { Confetti } from "@/components/shared/Confetti";

const DEFAULT_DURATION = 4000;
const AIRDROP_DURATION = 6000;

/* ─── Single Toast ──────────────────────────────────────────────────────── */

function Toast({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToast();

  const dismiss = useCallback(() => {
    removeToast(toast.id);
  }, [removeToast, toast.id]);

  useEffect(() => {
    const duration = toast.duration ?? (toast.type === "airdrop" ? AIRDROP_DURATION : DEFAULT_DURATION);
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [dismiss, toast.duration, toast.type]);

  const isAirdrop = toast.type === "airdrop";

  const config = isAirdrop
    ? {
        icon: <span className="text-base leading-none">🪙</span>,
        border: "border-gold/50",
        iconBg: "bg-gold/15",
        iconColor: "text-gold",
        titleClass: "text-gold",
        bg: "bg-bg-surface",
      }
    : {
        icon: {
          success: <IconCheck size={16} />,
          error:   <IconX size={16} />,
          warning: <IconAlertTriangle size={16} />,
          info:    <IconInfo size={16} />,
          airdrop: <span>🪙</span>, // fallback
        }[toast.type],
        border: {
          success: "border-up/30",
          error:   "border-down/30",
          warning: "border-gold/30",
          info:    "border-primary/30",
          airdrop: "border-gold/50",
        }[toast.type],
        iconBg: {
          success: "bg-up/10",
          error:   "bg-down/10",
          warning: "bg-gold/10",
          info:    "bg-primary/10",
          airdrop: "bg-gold/15",
        }[toast.type],
        iconColor: {
          success: "text-up",
          error:   "text-down",
          warning: "text-gold",
          info:    "text-primary",
          airdrop: "text-gold",
        }[toast.type],
        titleClass: "text-text-primary",
        bg: "bg-bg-surface",
      };

  return (
    <div
      className={`
        flex items-start gap-3 w-full max-w-sm
        ${config.bg} border ${config.border}
        rounded-2xl p-4 shadow-card
        animate-slide-up
        ${isAirdrop ? "ring-1 ring-gold/20" : ""}
      `}
      role="alert"
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.iconBg} ${config.iconColor}`}>
        {config.icon}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className={`font-outfit font-semibold text-sm leading-tight ${config.titleClass}`}>
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-text-secondary font-outfit text-xs mt-0.5 leading-relaxed">
            {toast.description}
          </p>
        )}
      </div>

      <button
        onClick={dismiss}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

/* ─── Toast Container ───────────────────────────────────────────────────── */

export function ToastContainer() {
  const { toasts } = useToast();
  const [showConfetti, setShowConfetti] = useState(false);

  // Trigger confetti whenever an airdrop toast arrives
  useEffect(() => {
    const hasAirdrop = toasts.some((t) => t.type === "airdrop");
    if (hasAirdrop) setShowConfetti(true);
  }, [toasts]);

  if (toasts.length === 0 && !showConfetti) return null;

  return (
    <>
      {showConfetti && (
        <Confetti active={showConfetti} duration={3500} />
      )}
      <div
        className="fixed top-4 left-0 right-0 z-[500] flex flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="w-full max-w-sm pointer-events-auto">
            <Toast toast={toast} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── useToastActions hook ──────────────────────────────────────────────── */

export function useToastActions() {
  const { addToast } = useToast();

  return {
    success: (title: string, description?: string) =>
      addToast({ type: "success", title, description }),
    error: (title: string, description?: string) =>
      addToast({ type: "error", title, description }),
    warning: (title: string, description?: string) =>
      addToast({ type: "warning", title, description }),
    info: (title: string, description?: string) =>
      addToast({ type: "info", title, description }),
    airdrop: (title: string, description?: string) =>
      addToast({ type: "airdrop", title, description, duration: AIRDROP_DURATION }),
    copied: () =>
      addToast({ type: "success", title: "Copied", duration: 2000 }),
  };
}
