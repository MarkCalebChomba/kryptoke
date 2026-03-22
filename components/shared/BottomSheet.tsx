"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@/components/icons";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showHandle?: boolean;
  showCloseButton?: boolean;
  maxHeight?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  showHandle = true,
  showCloseButton = false,
  maxHeight = "92dvh",
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => document.body.classList.remove("no-scroll");
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="sheet-overlay animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="sheet-panel animate-slide-up"
        style={{ maxHeight }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {showHandle && <div className="sheet-handle" />}

        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            {title && (
              <h2 className="font-syne font-semibold text-base text-text-primary">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="tap-target text-text-muted hover:text-text-secondary transition-colors ml-auto"
                aria-label="Close"
              >
                <IconX size={20} />
              </button>
            )}
          </div>
        )}

        <div className="overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

/* ─── Coming Soon Sheet ─────────────────────────────────────────────────── */

interface ComingSoonSheetProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  description?: string;
}

export function ComingSoonSheet({
  isOpen,
  onClose,
  featureName,
  description,
}: ComingSoonSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} showCloseButton title={featureName}>
      <div className="px-5 pb-8">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              stroke="#F0B429" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p className="text-text-secondary font-outfit text-sm leading-relaxed mb-4">
          {description ?? "We are working hard to bring this feature to KryptoKe. Stay tuned for updates."}
        </p>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-6 px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === 1 ? "bg-primary" : "bg-border-2"}`} />
            ))}
          </div>
          <span className="font-outfit text-xs text-text-muted">In development — launching Q3 2025</span>
        </div>

        <button onClick={onClose} className="btn-primary">Got it</button>
      </div>
    </BottomSheet>
  );
}
