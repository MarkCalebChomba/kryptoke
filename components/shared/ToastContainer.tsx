"use client";

import { useEffect, useCallback } from "react";
import { useToast } from "@/lib/store";
import type { ToastMessage } from "@/types";
import { IconCheck, IconX, IconAlertTriangle, IconInfo } from "@/components/icons";

const DEFAULT_DURATION = 4000;

/* ─── Single Toast ──────────────────────────────────────────────────────── */

function Toast({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToast();

  const dismiss = useCallback(() => {
    removeToast(toast.id);
  }, [removeToast, toast.id]);

  useEffect(() => {
    const duration = toast.duration ?? DEFAULT_DURATION;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [dismiss, toast.duration]);

  const config = {
    success: {
      icon: <IconCheck size={16} />,
      border: "border-up/30",
      iconBg: "bg-up/10",
      iconColor: "text-up",
    },
    error: {
      icon: <IconX size={16} />,
      border: "border-down/30",
      iconBg: "bg-down/10",
      iconColor: "text-down",
    },
    warning: {
      icon: <IconAlertTriangle size={16} />,
      border: "border-gold/30",
      iconBg: "bg-gold/10",
      iconColor: "text-gold",
    },
    info: {
      icon: <IconInfo size={16} />,
      border: "border-primary/30",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
  }[toast.type];

  return (
    <div
      className={`
        flex items-start gap-3 w-full max-w-sm
        bg-bg-surface border ${config.border}
        rounded-2xl p-4 shadow-card
        animate-slide-up
      `}
      role="alert"
    >
      <div
        className={`
          flex-shrink-0 w-7 h-7 rounded-full
          flex items-center justify-center
          ${config.iconBg} ${config.iconColor}
        `}
      >
        {config.icon}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-text-primary font-outfit font-semibold text-sm leading-tight">
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

  if (toasts.length === 0) return null;

  return (
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
    copied: () =>
      addToast({ type: "success", title: "Copied", duration: 2000 }),
  };
}
