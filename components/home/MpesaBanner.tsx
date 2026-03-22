"use client";

import { useAuth } from "@/lib/store";
import { IconMpesa } from "@/components/icons";

interface MpesaBannerProps {
  paybillNumber?: string;
  onDeposit: () => void;
}

export function MpesaBanner({ paybillNumber = "000000", onDeposit }: MpesaBannerProps) {
  const { user } = useAuth();
  const accountRef = user?.uid.slice(0, 10).toUpperCase() ?? "—";

  return (
    <div className="mx-4 card border-mpesa/20 bg-mpesa/5">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-mpesa/15 flex items-center justify-center flex-shrink-0">
            <IconMpesa size={18} className="text-mpesa" />
          </div>
          <div>
            <p className="font-outfit text-sm font-semibold text-text-primary leading-tight">
              Deposit via M-Pesa
            </p>
            <p className="font-outfit text-xs text-text-muted mt-0.5">
              Instant · No fees
            </p>
            <div className="flex gap-3 mt-1.5">
              <div>
                <p className="font-outfit text-[10px] text-text-muted">Paybill</p>
                <p className="font-price text-xs text-text-primary">{paybillNumber}</p>
              </div>
              <div>
                <p className="font-outfit text-[10px] text-text-muted">Account No.</p>
                <p className="font-price text-xs text-text-primary">{accountRef}</p>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={onDeposit}
          className="flex-shrink-0 bg-mpesa text-white font-outfit font-semibold text-xs px-4 py-2.5 rounded-xl active:opacity-85 transition-opacity"
        >
          Deposit
        </button>
      </div>
    </div>
  );
}
