"use client";

import { cn } from "@/lib/utils/cn";
import { IconChevronLeft } from "@/components/icons";
import { useRouter } from "next/navigation";

interface TopBarProps {
  title?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  transparent?: boolean;
  className?: string;
}

export function TopBar({
  title,
  left,
  right,
  showBack = false,
  onBack,
  transparent = false,
  className,
}: TopBarProps) {
  const router = useRouter();

  function handleBack() {
    if (onBack) onBack();
    else router.back();
  }

  return (
    <div
      className={cn(
        "top-bar",
        transparent && "bg-transparent border-transparent",
        className
      )}
    >
      {/* Left */}
      <div className="flex items-center gap-1 min-w-[40px]">
        {showBack && (
          <button
            onClick={handleBack}
            className="tap-target text-text-muted hover:text-text-primary transition-colors -ml-2"
            aria-label="Back"
          >
            <IconChevronLeft size={24} />
          </button>
        )}
        {left}
      </div>

      {/* Center */}
      {title && (
        <div className="absolute left-1/2 -translate-x-1/2 font-syne font-semibold text-base text-text-primary">
          {title}
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-1 min-w-[40px] justify-end">
        {right}
      </div>
    </div>
  );
}
