import { getDb } from "@/server/db/client";
import type { NotificationType } from "@/types";

interface CreateNotificationInput {
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  const db = getDb();

  const { error } = await db.from("notifications").insert({
    uid: input.uid,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    data: input.data ?? {},
  });

  if (error) {
    console.error("[Notifications] Failed to create notification:", error.message);
  }
  // Supabase Realtime will broadcast the insert to subscribed clients automatically
}

/* ─── Notification templates ────────────────────────────────────────────── */

export const Notifications = {
  depositConfirmed: (uid: string, amountKes: string, usdtAmount: string, txId: string) =>
    createNotification({
      uid,
      type: "deposit_confirmed",
      title: "Deposit confirmed",
      body: `KSh ${amountKes} deposited. ${usdtAmount} USDT credited to your account.`,
      data: { txId, amountKes, usdtAmount },
    }),

  withdrawalSent: (uid: string, amountKes: string, mpesaRef: string, txId: string) =>
    createNotification({
      uid,
      type: "withdrawal_sent",
      title: "Withdrawal sent",
      body: `KSh ${amountKes} sent to your M-Pesa. Ref: ${mpesaRef}`,
      data: { txId, amountKes, mpesaRef },
    }),

  orderFilled: (uid: string, tokenSymbol: string, side: string, amount: string, tradeId: string) =>
    createNotification({
      uid,
      type: "order_filled",
      title: "Order filled",
      body: `Your ${side} order for ${amount} ${tokenSymbol} has been filled.`,
      data: { tradeId, tokenSymbol, side, amount },
    }),

  securityAlert: (uid: string, message: string) =>
    createNotification({
      uid,
      type: "security_alert",
      title: "Security alert",
      body: message,
      data: {},
    }),

  earnInterest: (uid: string, amount: string, asset: string) =>
    createNotification({
      uid,
      type: "earn_interest",
      title: "Earn interest distributed",
      body: `${amount} ${asset} interest has been added to your Earn account.`,
      data: { amount, asset },
    }),
};
