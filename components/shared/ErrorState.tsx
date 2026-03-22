import { cn } from "@/lib/utils/cn";
import { IconRefresh } from "@/components/icons";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-4" : "py-12 px-6",
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-down/10 flex items-center justify-center mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#FF4560" strokeWidth="1.75" />
          <path d="M12 8V12" stroke="#FF4560" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.75" fill="#FF4560" />
        </svg>
      </div>
      <p className="text-text-secondary font-outfit text-sm mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-primary font-outfit text-sm font-medium"
        >
          <IconRefresh size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
