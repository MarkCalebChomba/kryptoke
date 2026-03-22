"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { IconX } from "@/components/icons";

interface PinPadProps {
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  error?: string | null;
}

const PIN_LENGTH = 6;

export function PinPad({
  onComplete,
  onCancel,
  title = "Enter Asset PIN",
  subtitle = "Required for withdrawals and large trades",
  isLoading = false,
  error = null,
}: PinPadProps) {
  const [pin, setPin] = useState("");

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= PIN_LENGTH || isLoading) return;
      const next = pin + digit;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        // Small delay so user sees the last dot fill before callback fires
        setTimeout(() => {
          onComplete(next);
          setPin("");
        }, 120);
      }
    },
    [pin, isLoading, onComplete]
  );

  const handleBackspace = useCallback(() => {
    if (isLoading) return;
    setPin((p) => p.slice(0, -1));
  }, [isLoading]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0"];

  return (
    <div className="flex flex-col items-center px-5 py-6 select-none">
      <p className="font-syne font-semibold text-base text-text-primary mb-1 text-center">
        {title}
      </p>
      <p className="text-text-muted font-outfit text-sm mb-6 text-center">
        {subtitle}
      </p>

      {/* Dot indicators */}
      <div className="flex gap-4 mb-6">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-full border-2 transition-all duration-150",
              i < pin.length
                ? "bg-primary border-primary scale-110"
                : "bg-transparent border-border-2"
            )}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-down font-outfit text-sm mb-4 text-center">{error}</p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {digits.map((digit, i) => {
          if (digit === "") {
            // Empty cell
            return <div key={i} />;
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(digit)}
              disabled={isLoading}
              className={cn(
                "h-14 rounded-2xl font-price text-xl font-medium text-text-primary",
                "bg-bg-surface2 border border-border",
                "active:scale-95 active:bg-border transition-all",
                "disabled:opacity-40"
              )}
            >
              {digit}
            </button>
          );
        })}

        {/* Backspace */}
        <button
          onClick={handleBackspace}
          disabled={isLoading || pin.length === 0}
          className={cn(
            "h-14 rounded-2xl flex items-center justify-center",
            "bg-bg-surface2 border border-border text-text-secondary",
            "active:scale-95 active:bg-border transition-all",
            "disabled:opacity-30"
          )}
          aria-label="Backspace"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 4H8L1 12L8 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 9L12 15"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <path
              d="M12 9L18 15"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Cancel */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-5 text-text-muted font-outfit text-sm flex items-center gap-1.5 tap-target"
        >
          <IconX size={14} />
          Cancel
        </button>
      )}
    </div>
  );
}
