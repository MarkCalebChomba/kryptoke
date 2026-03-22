import { cn } from "@/lib/utils/cn";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          className={i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "card animate-pulse-slow",
        className
      )}
    >
      <Skeleton height={20} className="w-1/3 mb-3" />
      <Skeleton height={32} className="w-2/3 mb-2" />
      <Skeleton height={14} className="w-1/2" />
    </div>
  );
}

export function SkeletonCoinRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton width={40} height={40} className="rounded-full flex-shrink-0" />
      <div className="flex-1">
        <Skeleton height={14} className="w-24 mb-1.5" />
        <Skeleton height={12} className="w-16" />
      </div>
      <div className="text-right">
        <Skeleton height={14} className="w-20 mb-1.5 ml-auto" />
        <Skeleton height={12} className="w-14 ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonPortfolioCard() {
  return (
    <div className="card mx-4">
      <Skeleton height={12} className="w-28 mb-3" />
      <Skeleton height={40} className="w-48 mb-2" />
      <Skeleton height={14} className="w-24 mb-4" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-2">
            <Skeleton height={12} className="w-16 mb-2" />
            <Skeleton height={20} className="w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
