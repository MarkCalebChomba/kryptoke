import { getDb } from "@/server/db/client";
import type { NotificationType } from "@/types";

interface CreateNotificationInput {
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/* ─── In-app notification (Supabase) ────────────────────────────────────── */

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

/* ─── Fetch user contact details ─────────────────────────────────────────── */

interface UserContact {
  email: string;
  phone: string | null;
  displayName: string | null;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

async function getUserContact(uid: string): Promise<UserContact | null> {
  try {
    const db = getDb();
    const { data } = await db
      .from("users")
      .select("email, phone, display_name, notification_email, notification_sms")
      .eq("uid", uid)
      .single();

    if (!data) return null;

    return {
      email: data.email,
      phone: data.phone,
      displayName: data.display_name,
      // Default true if column not yet present
      emailNotifications: data.notification_email !== false,
      smsNotifications: data.notification_sms !== false,
    };
  } catch {
    return null;
  }
}

/* ─── Email via Resend ───────────────────────────────────────────────────── */

const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";

function emailBase(content: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;
                background:#080C14;color:#F0F4FF;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:800;color:#00E5B4;">KryptoKe</span>
      </div>
      ${content}
      <hr style="border:none;border-top:1px solid #1C2840;margin:24px 0;" />
      <p style="color:#4A5B7A;font-size:12px;margin:0;">
        KryptoKe v${APP_VERSION} — Built for Kenya. Do not reply to this email.
      </p>
    </div>
  `;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Email] RESEND_API_KEY not configured — skipping");
    return;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: RESEND_FROM, to, subject, html });
    if (error) console.error("[Email] Resend error:", error.message);
  } catch (err) {
    console.error("[Email] Send failed:", err);
  }
}

/* ─── SMS via Africa's Talking ───────────────────────────────────────────── */

export async function sendSms(phone: string, message: string): Promise<void> {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!username || !apiKey) {
    console.error("[SMS] Africa's Talking credentials not configured — skipping");
    return;
  }
  // Enforce 160-char limit (SMS single message)
  const safeMsg = message.length > 160 ? message.slice(0, 157) + "..." : message;
  try {
    const normalized = phone.startsWith("+") ? phone : `+${phone}`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AfricasTalking = require("africastalking") as (opts: {
      username: string;
      apiKey: string;
    }) => {
      SMS: {
        send: (opts: object) => Promise<{
          SMSMessageData?: { Recipients?: Array<{ statusCode: number; status: string }> };
        }>;
      };
    };
    const at = AfricasTalking({ username, apiKey });
    const opts: Record<string, unknown> = { to: [normalized], message: safeMsg };
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    if (senderId && username !== "sandbox") opts.from = senderId;
    const result = await at.SMS.send(opts);
    const failed = (result?.SMSMessageData?.Recipients ?? []).filter((r) => r.statusCode !== 101);
    if (failed.length > 0) console.error("[SMS] Delivery failed:", failed[0]?.status);
  } catch (err) {
    console.error("[SMS] Send failed:", err);
  }
}

/* ─── Notification templates ─────────────────────────────────────────────── */

export const Notifications = {

  /* deposit confirmed ──────────────────────────────────────────────────── */
  depositConfirmed: async (uid: string, amountKes: string, usdtAmount: string, txId: string) => {
    await createNotification({
      uid, type: "deposit_confirmed",
      title: "Deposit confirmed",
      body: `KSh ${amountKes} deposited. ${usdtAmount} USDT credited to your account.`,
      data: { txId, amountKes, usdtAmount },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, "Deposit confirmed — KryptoKe", emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Deposit confirmed ✓</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          Your M-Pesa deposit has been received and credited to your account.
        </p>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">Amount deposited</span>
            <span style="color:#F0F4FF;font-weight:600;">KSh ${amountKes}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">USDT credited</span>
            <span style="color:#00E5B4;font-weight:600;">${usdtAmount} USDT</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8A9CC0;font-size:14px;">Ref</span>
            <span style="color:#4A5B7A;font-size:12px;font-family:monospace;">${txId.slice(-12)}</span>
          </div>
        </div>
        <a href="https://kryptoke-mu.vercel.app/trade"
           style="display:block;text-align:center;background:#00E5B4;color:#080C14;font-weight:700;
                  padding:14px 24px;border-radius:12px;text-decoration:none;font-size:15px;">
          Start Trading
        </a>
      `));
    }
    if (c.smsNotifications && c.phone) {
      await sendSms(c.phone,
        `KryptoKe: KSh ${amountKes} deposit confirmed. ${usdtAmount} USDT credited. Ref: ${txId.slice(-8)}`
      );
    }
  },

  /* withdrawal initiated ───────────────────────────────────────────────── */
  withdrawalInitiated: async (uid: string, amountKes: string, txId: string) => {
    await createNotification({
      uid, type: "withdrawal_sent",
      title: "Withdrawal initiated",
      body: `KSh ${amountKes} withdrawal is being processed.`,
      data: { txId, amountKes, status: "initiated" },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, "Withdrawal initiated — KryptoKe", emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Withdrawal initiated</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          Your withdrawal request of <strong style="color:#F0F4FF;">KSh ${amountKes}</strong>
          is being processed. You will receive another notification once funds are sent.
        </p>
        <p style="color:#4A5B7A;font-size:12px;">Ref: ${txId}</p>
      `));
    }
  },

  /* withdrawal sent (M-Pesa B2C complete) ─────────────────────────────── */
  withdrawalSent: async (uid: string, amountKes: string, mpesaRef: string, txId: string) => {
    await createNotification({
      uid, type: "withdrawal_sent",
      title: "Withdrawal sent",
      body: `KSh ${amountKes} sent to your M-Pesa. Ref: ${mpesaRef}`,
      data: { txId, amountKes, mpesaRef },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, "Withdrawal sent — KryptoKe", emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Withdrawal sent ✓</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          Your withdrawal has been processed and sent to your M-Pesa.
        </p>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">Amount</span>
            <span style="color:#F0F4FF;font-weight:600;">KSh ${amountKes}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8A9CC0;font-size:14px;">M-Pesa ref</span>
            <span style="color:#F0B429;font-weight:600;font-family:monospace;">${mpesaRef}</span>
          </div>
        </div>
        <p style="color:#8A9CC0;font-size:13px;">
          If you did not request this, contact support immediately at support@kryptoke.com
        </p>
      `));
    }
    if (c.smsNotifications && c.phone) {
      await sendSms(c.phone,
        `KryptoKe: KSh ${amountKes} sent to M-Pesa. Ref: ${mpesaRef}. Not you? Call support.`
      );
    }
  },

  /* crypto withdrawal completed ────────────────────────────────────────── */
  withdrawalCompleted: async (uid: string, amount: string, asset: string, txHash: string) => {
    await createNotification({
      uid, type: "withdrawal_sent",
      title: "Crypto withdrawal sent",
      body: `${amount} ${asset} has been broadcast to the network.`,
      data: { txHash, amount, asset },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, `${asset} withdrawal sent — KryptoKe`, emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">
          Crypto withdrawal sent ✓
        </h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          <strong style="color:#F0F4FF;">${amount} ${asset}</strong>
          has been broadcast to the network.
        </p>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8A9CC0;font-size:14px;">Tx hash</span>
            <span style="color:#4A5B7A;font-size:12px;font-family:monospace;">${txHash.slice(0,18)}…</span>
          </div>
        </div>
        <p style="color:#8A9CC0;font-size:13px;">
          Not you? Contact support at support@kryptoke.com immediately.
        </p>
      `));
    }
  },

  /* new device login ───────────────────────────────────────────────────── */
  newDeviceLogin: async (uid: string, ip: string, userAgent: string) => {
    await createNotification({
      uid, type: "security_alert",
      title: "New login detected",
      body: "A login was detected from a new device. If this wasn't you, secure your account.",
      data: { ip, userAgent },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      const device = userAgent.length > 60 ? userAgent.slice(0, 60) + "…" : userAgent;
      await sendEmail(c.email, "New login to your KryptoKe account", emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0B429;">
          New login detected ⚠️
        </h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          A new login to your account was detected. If this was you, no action is needed.
          If not, change your password immediately.
        </p>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">IP</span>
            <span style="color:#F0F4FF;font-family:monospace;">${ip}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8A9CC0;font-size:14px;">Device</span>
            <span style="color:#F0F4FF;font-size:13px;">${device}</span>
          </div>
        </div>
        <a href="https://kryptoke-mu.vercel.app/account/security"
           style="display:block;text-align:center;background:#F0B429;color:#080C14;font-weight:700;
                  padding:14px 24px;border-radius:12px;text-decoration:none;font-size:15px;">
          Review Security Settings
        </a>
      `));
    }
  },

  /* large trade (>$100) ────────────────────────────────────────────────── */
  largeTrade: async (
    uid: string, side: string, amount: string,
    tokenSymbol: string, usdValue: string, tradeId: string
  ) => {
    await createNotification({
      uid, type: "order_filled",
      title: "Large trade executed",
      body: `${side.toUpperCase()} ${amount} ${tokenSymbol} (~$${usdValue}) filled.`,
      data: { tradeId, side, amount, tokenSymbol, usdValue },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      const sideColor = side.toLowerCase() === "buy" ? "#00E5B4" : "#FF4D4F";
      await sendEmail(c.email, `Large ${side} trade executed — KryptoKe`, emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Trade executed ✓</h2>
        <div style="background:#0E1420;border:1px solid #1C2840;border-radius:12px;padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">Side</span>
            <span style="color:${sideColor};font-weight:700;">${side.toUpperCase()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8A9CC0;font-size:14px;">Amount</span>
            <span style="color:#F0F4FF;font-weight:600;">${amount} ${tokenSymbol}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8A9CC0;font-size:14px;">USD value</span>
            <span style="color:#F0F4FF;font-weight:600;">~$${usdValue}</span>
          </div>
        </div>
        <p style="color:#4A5B7A;font-size:12px;">Trade ID: ${tradeId}</p>
      `));
    }
  },

  /* order filled (standard — in-app only, no email/SMS spam) ──────────── */
  orderFilled: async (uid: string, tokenSymbol: string, side: string, amount: string, tradeId: string) => {
    await createNotification({
      uid, type: "order_filled",
      title: "Order filled",
      body: `Your ${side} order for ${amount} ${tokenSymbol} has been filled.`,
      data: { tradeId, tokenSymbol, side, amount },
    });
  },

  /* security alert ─────────────────────────────────────────────────────── */
  securityAlert: async (uid: string, message: string) => {
    await createNotification({
      uid, type: "security_alert",
      title: "Security alert",
      body: message,
      data: {},
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, "Security alert — KryptoKe", emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0B429;">Security alert ⚠️</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">${message}</p>
        <a href="https://kryptoke-mu.vercel.app/account/security"
           style="display:block;text-align:center;background:#F0B429;color:#080C14;font-weight:700;
                  padding:14px 24px;border-radius:12px;text-decoration:none;font-size:15px;">
          Review Account
        </a>
      `));
    }
  },


  /* P2P / internal transfer — sender ──────────────────────────────────── */
  transferSent: async (uid: string, amount: string, asset: string, recipientName: string) => {
    await createNotification({
      uid, type: "transfer_sent" as never,
      title: "Transfer sent",
      body: `${amount} ${asset} sent to ${recipientName}.`,
      data: { amount, asset, recipientName },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, `Transfer sent — KryptoKe`, emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Transfer sent ✓</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          You sent <strong style="color:#F0F4FF;">${amount} ${asset}</strong> to <strong style="color:#F0F4FF;">${recipientName}</strong>.
          Transfers are instant and irreversible.
        </p>
      `));
    }
    if (c.smsNotifications && c.phone) {
      await sendSms(c.phone, `KryptoKe: You sent ${amount} ${asset} to ${recipientName}.`);
    }
  },

  /* P2P / internal transfer — recipient ───────────────────────────────── */
  transferReceived: async (uid: string, amount: string, asset: string, senderName: string, note?: string) => {
    await createNotification({
      uid, type: "transfer_received" as never,
      title: "Transfer received",
      body: `You received ${amount} ${asset} from ${senderName}${note ? `: "${note}"` : ""}.`,
      data: { amount, asset, senderName, note },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, `You received ${asset} — KryptoKe`, emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#00E5B4;">Transfer received 💸</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          <strong style="color:#F0F4FF;">${senderName}</strong> sent you
          <strong style="color:#00E5B4;">${amount} ${asset}</strong>.
          ${note ? `<br/><em style="color:#8A9CC0;">"${note}"</em>` : ""}
        </p>
        <a href="https://kryptoke-mu.vercel.app"
           style="display:block;text-align:center;background:#00E5B4;color:#080C14;font-weight:700;
                  padding:14px 24px;border-radius:12px;text-decoration:none;font-size:15px;">
          View Wallet
        </a>
      `));
    }
    if (c.smsNotifications && c.phone) {
      await sendSms(c.phone,
        `KryptoKe: ${senderName} sent you ${amount} ${asset}${note ? ` "${note.slice(0, 40)}"` : ""}.`
      );
    }
  },

  /* Trade / convert completed ──────────────────────────────────────────── */
  tradeFilled: async (uid: string, fromAsset: string, toAsset: string, fromAmount: string, toAmount: string) => {
    await createNotification({
      uid, type: "order_filled",
      title: "Trade completed",
      body: `Swapped ${fromAmount} ${fromAsset} → ${toAmount} ${toAsset}.`,
      data: { fromAsset, toAsset, fromAmount, toAmount },
    });
    // In-app only — no email/SMS for routine small trades (email for large trades already handled)
  },

  /* Crypto withdrawal queued ───────────────────────────────────────────── */
  cryptoWithdrawalQueued: async (uid: string, amount: string, asset: string, toAddress: string, cancelWindow: number) => {
    await createNotification({
      uid, type: "withdrawal_sent" as never,
      title: "Withdrawal queued",
      body: `${amount} ${asset} queued. Cancel within ${cancelWindow} min if this was a mistake.`,
      data: { amount, asset, toAddress, cancelWindow },
    });
    const c = await getUserContact(uid);
    if (!c) return;
    if (c.emailNotifications) {
      await sendEmail(c.email, `Crypto withdrawal queued — KryptoKe`, emailBase(`
        <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:#F0F4FF;">Withdrawal queued</h2>
        <p style="color:#8A9CC0;margin-bottom:20px;font-size:15px;">
          <strong style="color:#F0F4FF;">${amount} ${asset}</strong> withdrawal to
          <code style="color:#4A5B7A;font-size:12px;">${toAddress.slice(0,12)}…${toAddress.slice(-6)}</code>
          has been queued. You have <strong style="color:#F0B429;">${cancelWindow} minutes</strong> to cancel.
        </p>
        <p style="color:#8A9CC0;font-size:13px;">
          Not you? Go to the app immediately and cancel from your withdrawal history, then contact support.
        </p>
      `));
    }
    if (c.smsNotifications && c.phone) {
      await sendSms(c.phone,
        `KryptoKe: ${amount} ${asset} withdrawal queued. Cancel within ${cancelWindow}min if not you.`
      );
    }
  },

  /* Internal account transfer (funding↔trading↔earn) ─────────────────── */
  internalTransfer: async (uid: string, amount: string, asset: string, from: string, to: string) => {
    await createNotification({
      uid, type: "transfer_received" as never,
      title: "Internal transfer complete",
      body: `${amount} ${asset} moved from ${from} to ${to} account.`,
      data: { amount, asset, from, to },
    });
    // In-app only — internal account moves don't warrant email/SMS
  },

  /* earn interest (in-app only) ────────────────────────────────────────── */
  earnInterest: async (uid: string, amount: string, asset: string) => {
    await createNotification({
      uid, type: "earn_interest",
      title: "Earn interest distributed",
      body: `${amount} ${asset} interest added to your Earn account.`,
      data: { amount, asset },
    });
  },
};
