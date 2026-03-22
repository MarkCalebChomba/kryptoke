"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

interface OtpInputProps {
  onComplete: (otp: string) => void;
  isLoading?: boolean;
  error?: string | null;
  autoFocus?: boolean;
}

const OTP_LENGTH = 6;

export function OtpInput({
  onComplete,
  isLoading = false,
  error = null,
  autoFocus = true,
}: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...values];
      next[index] = digit;
      setValues(next);

      if (digit && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      const complete = next.join("");
      if (complete.length === OTP_LENGTH && !next.includes("")) {
        onComplete(complete);
      }
    },
    [values, onComplete]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (values[index]) {
          const next = [...values];
          next[index] = "";
          setValues(next);
        } else if (index > 0) {
          inputRefs.current[index - 1]?.focus();
          const next = [...values];
          next[index - 1] = "";
          setValues(next);
        }
      }
      if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [values]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (!pasted) return;

      const next = Array(OTP_LENGTH).fill("");
      pasted.split("").forEach((char, i) => {
        if (i < OTP_LENGTH) next[i] = char;
      });
      setValues(next);

      const lastFilled = Math.min(pasted.length - 1, OTP_LENGTH - 1);
      inputRefs.current[lastFilled]?.focus();

      if (pasted.length === OTP_LENGTH) {
        onComplete(pasted);
      }
    },
    [onComplete]
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-3">
        {values.map((val, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            disabled={isLoading}
            className={cn(
              "w-11 h-14 text-center font-price text-xl font-medium",
              "bg-bg-surface2 rounded-xl border-2 transition-all",
              "focus:outline-none focus:border-primary",
              error
                ? "border-down text-down"
                : val
                ? "border-primary text-text-primary"
                : "border-border text-text-primary",
              "disabled:opacity-50"
            )}
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-down font-outfit text-sm text-center">{error}</p>
      )}
    </div>
  );
}
