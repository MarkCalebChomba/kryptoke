"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useCreateAlert, usePriceAlerts, useDeleteAlert } from "@/lib/hooks/useTokenDetail";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput, formatPrice, formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { IconBell, IconTrash, IconCheck } from "@/components/icons";

interface PriceAlertSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tokenAddress: string;
  tokenSymbol: string;
  currentPrice: string;
}

export function PriceAlertSheet({
  isOpen,
  onClose,
  tokenAddress,
  tokenSymbol,
  currentPrice,
}: PriceAlertSheetProps) {
  const toast = useToastActions();
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice] = useState(currentPrice);
  const [created, setCreated] = useState(false);

  const createAlert = useCreateAlert();
  const deleteAlert = useDeleteAlert();
  const { data: alerts } = usePriceAlerts();

  const tokenAlerts = (alerts ?? []).filter(
    (a) => a.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
  );

  async function handleCreate() {
    if (!price || parseFloat(price) <= 0) {
      toast.error("Enter a valid price");
      return;
    }

    createAlert.mutate(
      { tokenAddress, tokenSymbol, condition, price },
      {
        onSuccess: () => {
          toast.success("Alert set", `Notify when ${tokenSymbol} goes ${condition} ${formatPrice(price)}`);
          setCreated(true);
          setTimeout(() => setCreated(false), 2000);
          setPrice(currentPrice);
        },
        onError: (err) => {
          toast.error("Failed to set alert", err instanceof Error ? err.message : undefined);
        },
      }
    );
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Price Alert" showCloseButton>
      <div className="px-4 pb-6 space-y-4">
        {/* Condition toggle */}
        <div>
          <p className="font-outfit text-xs text-text-muted mb-2">Alert me when price goes</p>
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["above", "below"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCondition(c)}
                className={cn(
                  "flex-1 py-2.5 font-outfit font-semibold text-sm capitalize transition-all",
                  condition === c
                    ? c === "above"
                      ? "bg-up text-bg"
                      : "bg-down text-white"
                    : "text-text-muted"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Price input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-outfit text-sm text-text-secondary">
              Target price (USDT)
            </label>
            <span className="font-outfit text-xs text-text-muted">
              Now: {formatPrice(currentPrice)}
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(sanitizeNumberInput(e.target.value))}
            className="input-field font-price text-lg"
            placeholder="0.00"
          />
        </div>

        {/* Set button */}
        <button
          onClick={handleCreate}
          disabled={createAlert.isPending || !price}
          className={cn(
            "w-full py-3.5 rounded-2xl font-outfit font-semibold text-sm transition-all active:scale-[0.98]",
            created ? "bg-up text-bg" : "btn-primary",
            (createAlert.isPending || !price) && "opacity-50 cursor-not-allowed"
          )}
        >
          {created ? (
            <span className="flex items-center justify-center gap-2">
              <IconCheck size={16} />
              Alert Set
            </span>
          ) : createAlert.isPending ? (
            "Setting alert..."
          ) : (
            <span className="flex items-center justify-center gap-2">
              <IconBell size={16} />
              Set Alert
            </span>
          )}
        </button>

        {/* Existing alerts for this token */}
        {tokenAlerts.length > 0 && (
          <div>
            <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">
              Active Alerts
            </p>
            <div className="space-y-2">
              {tokenAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 card-2"
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      alert.condition === "above" ? "bg-up" : "bg-down"
                    )}
                  />
                  <div className="flex-1">
                    <p className="font-outfit text-sm text-text-primary">
                      {alert.condition === "above" ? "Above" : "Below"}{" "}
                      <span className="font-price">{formatPrice(alert.price)}</span>
                    </p>
                    <p className="font-outfit text-xs text-text-muted">
                      {formatTimeAgo(alert.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteAlert.mutate(alert.id)}
                    disabled={deleteAlert.isPending}
                    className="tap-target text-text-muted hover:text-down transition-colors"
                    aria-label="Delete alert"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
