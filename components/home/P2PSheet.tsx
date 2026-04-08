"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/hooks/useWallet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PinPad } from "@/components/auth/PinPad";
import { apiPost } from "@/lib/api/client";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

export function P2PSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { usdtBalance, kesBalance } = useWallet();
  const [step, setStep] = useState<"form" | "pin">("form");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const availableBalance = asset === "KES" ? kesBalance : usdtBalance;

  const send = useMutation({
    mutationFn: (assetPin: string) =>
      apiPost<{ recipient: { displayName: string }; message: string }>("/wallet/transfer-to-user", {
        recipientIdentifier: recipient.trim(),
        asset, amount, assetPin, note: note || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Sent! ${data.message}`);
      setStep("form"); setRecipient(""); setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (err) => setPinError(err instanceof Error ? err.message : "Send failed"),
  });

  if (step === "pin") {
    return (
      <BottomSheet isOpen={isOpen} onClose={() => { setStep("form"); setPinError(null); }}>
        <div className="px-4 py-2">
          <PinPad
            onComplete={(pin) => send.mutate(pin)}
            onCancel={() => { setStep("form"); setPinError(null); }}
            title="Confirm Send"
            subtitle={`Send ${amount} ${asset} to ${recipient}`}
            error={pinError}
            isLoading={send.isPending}
          />
        </div>
      </BottomSheet>
    );
  }

  const canSend =
    recipient.length >= 3 &&
    parseFloat(amount) > 0 &&
    parseFloat(amount) <= parseFloat(availableBalance);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Send to User" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Recipient UID or email</label>
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
            className="input-field" placeholder="user@email.com or uid" autoComplete="off" />
          <p className="font-outfit text-[10px] text-text-muted mt-1">The recipient must have a KryptoKe account.</p>
        </div>
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Asset</label>
          <div className="flex gap-2">
            {["USDT", "KES"].map((a) => (
              <button key={a} onClick={() => { setAsset(a); setAmount(""); }}
                className={cn("flex-1 py-2.5 rounded-xl font-outfit text-sm font-semibold border transition-all",
                  asset === a ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted")}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-xs text-text-secondary">Amount</label>
            <span className="font-outfit text-xs text-text-muted">
              Balance: {parseFloat(availableBalance).toFixed(asset === "KES" ? 2 : 4)} {asset}
            </span>
          </div>
          <input type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 6))}
            className="input-field" placeholder="0.00" />
        </div>
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            className="input-field" placeholder="e.g. For lunch" maxLength={100} />
        </div>
        <div className="card border-gold/20 bg-gold/5">
          <p className="font-outfit text-xs text-gold/90 leading-relaxed">
            Transfers to other users are instant and irreversible. Double-check the recipient.
          </p>
        </div>
        <button onClick={() => setStep("pin")} disabled={!canSend} className="btn-primary disabled:opacity-50">
          Continue
        </button>
      </div>
    </BottomSheet>
  );
}
