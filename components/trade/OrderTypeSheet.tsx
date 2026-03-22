"use client";

import { BottomSheet } from "@/components/shared/BottomSheet";
import { IconCheck } from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import type { OrderType } from "@/types";

interface OrderTypeOption {
  value: OrderType;
  label: string;
  description: string;
  comingSoon?: boolean;
  section: "basic" | "advanced" | "bots";
}

const ORDER_TYPES: OrderTypeOption[] = [
  { section: "basic", value: "limit", label: "Limit Order", description: "Buy or sell at a specified price" },
  { section: "basic", value: "market", label: "Market Order", description: "Execute immediately at market price" },
  { section: "basic", value: "tp_sl", label: "TP / SL", description: "Take profit and stop loss" },
  { section: "advanced", value: "trailing_stop", label: "Trailing Stop", description: "Stop loss that follows price movement" },
  { section: "advanced", value: "trigger", label: "Trigger", description: "Execute when price hits a trigger" },
  { section: "advanced", value: "advanced_limit", label: "Advanced Limit", description: "Post-only, hidden, and more" },
  { section: "bots", value: "limit", label: "Iceberg", description: "Hide large orders in small chunks", comingSoon: true },
  { section: "bots", value: "limit", label: "TWAP", description: "Time-weighted average price execution", comingSoon: true },
];

const SECTION_LABELS = {
  basic: "Basic",
  advanced: "Advanced",
  bots: "Slicing Bots",
};

interface OrderTypeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selected: OrderType;
  onSelect: (type: OrderType) => void;
}

export function OrderTypeSheet({
  isOpen,
  onClose,
  selected,
  onSelect,
}: OrderTypeSheetProps) {
  const sections = (["basic", "advanced", "bots"] as const).map((section) => ({
    section,
    items: ORDER_TYPES.filter((t) => t.section === section),
  }));

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Order Type" showCloseButton>
      <div className="pb-6">
        {sections.map(({ section, items }) => (
          <div key={section}>
            <p className="px-4 pt-4 pb-1 font-outfit text-xs font-semibold text-text-muted uppercase tracking-wider">
              {SECTION_LABELS[section]}
            </p>
            {items.map((opt) => (
              <button
                key={`${opt.section}-${opt.label}`}
                onClick={() => {
                  if (opt.comingSoon) return;
                  onSelect(opt.value);
                  onClose();
                }}
                disabled={opt.comingSoon}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 transition-colors",
                  opt.comingSoon
                    ? "opacity-40 cursor-not-allowed"
                    : "active:bg-bg-surface2"
                )}
              >
                <div className="flex-1 text-left">
                  <p className="font-outfit text-sm font-medium text-text-primary">
                    {opt.label}
                    {opt.comingSoon && (
                      <span className="ml-2 text-[10px] font-outfit text-text-muted border border-border px-1.5 py-0.5 rounded">
                        Soon
                      </span>
                    )}
                  </p>
                  <p className="font-outfit text-xs text-text-muted mt-0.5">
                    {opt.description}
                  </p>
                </div>
                {!opt.comingSoon && selected === opt.value && (
                  <IconCheck size={16} className="text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
