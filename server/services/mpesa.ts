import { redis, CacheKeys, CacheTTL } from "@/lib/redis/client";
import { normalizeKenyanPhone } from "@/lib/utils/formatters";

const DARAJA_BASE =
  process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

/* ─── OAuth Token — Bug #2 fix: cached in Redis for 55 minutes ─────────── */

export async function getMpesaToken(): Promise<string> {
  // Check cache first
  const cached = await redis.get<string>(CacheKeys.mpesaToken());
  if (cached) return cached;

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set");
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const res = await fetch(
    `${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`M-Pesa OAuth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  const token = data.access_token;

  if (!token) {
    throw new Error("M-Pesa OAuth returned no access_token");
  }

  // Cache for 55 minutes (token expires in 60 minutes)
  await redis.set(CacheKeys.mpesaToken(), token, { ex: CacheTTL.mpesaToken });

  return token;
}

/* ─── STK Push (Lipa Na M-Pesa Online) ─────────────────────────────────── */

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export async function initiateStkPush(
  phone: string,
  amountKes: number,
  accountReference: string,
  transactionDesc: string
): Promise<StkPushResult> {
  const token = await getMpesaToken();
  const paybill = process.env.MPESA_PAYBILL;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/v1/mpesa/callback`;

  if (!paybill || !passkey) {
    throw new Error("MPESA_PAYBILL and MPESA_PASSKEY must be set");
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);

  const password = Buffer.from(`${paybill}${passkey}${timestamp}`).toString("base64");
  const normalizedPhone = normalizeKenyanPhone(phone);

  const body = {
    BusinessShortCode: paybill,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.ceil(amountKes), // M-Pesa requires integer amounts
    PartyA: normalizedPhone,
    PartyB: paybill,
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  };

  const res = await fetch(
    `${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STK Push failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
  };

  if (data.ResponseCode !== "0") {
    throw new Error(
      `STK Push rejected: ${data.ResponseDescription ?? "Unknown error"}`
    );
  }

  return {
    merchantRequestId: data.MerchantRequestID ?? "",
    checkoutRequestId: data.CheckoutRequestID ?? "",
    responseCode: data.ResponseCode ?? "",
    responseDescription: data.ResponseDescription ?? "",
    customerMessage: data.CustomerMessage ?? "",
  };
}

/* ─── B2C Payment (Withdrawal to phone) ────────────────────────────────── */

export interface B2cResult {
  conversationId: string;
  originatorConversationId: string;
  responseDescription: string;
}

export async function initiateB2c(
  phone: string,
  amountKes: number,
  occasion: string
): Promise<B2cResult> {
  const token = await getMpesaToken();
  const shortcode = process.env.MPESA_B2C_SHORTCODE;
  const initiatorName = process.env.MPESA_B2C_INITIATOR_NAME;
  const initiatorPassword = process.env.MPESA_B2C_INITIATOR_PASSWORD;
  const callbackBase = process.env.MPESA_CALLBACK_BASE_URL;

  if (!shortcode || !initiatorName || !initiatorPassword) {
    throw new Error("B2C credentials not configured");
  }

  // Encrypt initiator password with Safaricom public certificate
  const securityCredential = await encryptInitiatorPassword(initiatorPassword);
  const normalizedPhone = normalizeKenyanPhone(phone);

  const body = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: "BusinessPayment",
    Amount: Math.floor(amountKes),
    PartyA: shortcode,
    PartyB: normalizedPhone,
    Remarks: "KryptoKe withdrawal",
    QueueTimeOutURL: `${callbackBase}/api/v1/withdraw/b2c/timeout`,
    ResultURL: `${callbackBase}/api/v1/withdraw/b2c/result`,
    Occasion: occasion,
  };

  const res = await fetch(
    `${DARAJA_BASE}/mpesa/b2c/v1/paymentrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2C initiation failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    ConversationID?: string;
    OriginatorConversationID?: string;
    ResponseDescription?: string;
    ResponseCode?: string;
  };

  if (data.ResponseCode !== "0") {
    throw new Error(
      `B2C rejected: ${data.ResponseDescription ?? "Unknown error"}`
    );
  }

  return {
    conversationId: data.ConversationID ?? "",
    originatorConversationId: data.OriginatorConversationID ?? "",
    responseDescription: data.ResponseDescription ?? "",
  };
}

/* ─── Password Encryption ───────────────────────────────────────────────── */

async function encryptInitiatorPassword(password: string): Promise<string> {
  // In sandbox, the password is used directly as base64
  // Sandbox: base64 encode. Production: RSA encrypt with Safaricom's certificate (MPESA_SAFARICOM_CERT env var)
  if (process.env.MPESA_ENVIRONMENT !== "production") {
    return Buffer.from(password).toString("base64");
  }

  // Production: use node:crypto with Safaricom's public cert
  const { publicEncrypt, constants } = await import("node:crypto");
  const cert = process.env.MPESA_SAFARICOM_CERT ?? "";
  const encrypted = publicEncrypt(
    {
      key: cert,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(password)
  );
  return encrypted.toString("base64");
}

/* ─── STK Callback Parser ───────────────────────────────────────────────── */

export interface StkCallbackData {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber: string | null;
  transactionDate: string | null;
  phoneNumber: string | null;
  amount: number | null;
}

export function parseStkCallback(body: unknown): StkCallbackData | null {
  try {
    const b = body as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: {
            Item?: Array<{ Name: string; Value?: unknown }>;
          };
        };
      };
    };

    const cb = b?.Body?.stkCallback;
    if (!cb) return null;

    const items = cb.CallbackMetadata?.Item ?? [];
    const getItem = (name: string) =>
      items.find((i) => i.Name === name)?.Value ?? null;

    return {
      merchantRequestId: cb.MerchantRequestID ?? "",
      checkoutRequestId: cb.CheckoutRequestID ?? "",
      resultCode: cb.ResultCode ?? -1,
      resultDesc: cb.ResultDesc ?? "",
      mpesaReceiptNumber: (getItem("MpesaReceiptNumber") as string) ?? null,
      transactionDate: (getItem("TransactionDate") as string)?.toString() ?? null,
      phoneNumber: (getItem("PhoneNumber") as string)?.toString() ?? null,
      amount: getItem("Amount") as number | null,
    };
  } catch {
    return null;
  }
}

/* ─── B2C Result Parser ─────────────────────────────────────────────────── */

export interface B2cResultData {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  transactionId: string | null;
  receiverPartyPublicName: string | null;
  transactionAmount: number | null;
  b2cUtilityAccountAvailableFunds: number | null;
}

export function parseB2cResult(body: unknown): B2cResultData | null {
  try {
    const b = body as {
      Result?: {
        ResultCode?: number;
        ResultDesc?: string;
        ConversationID?: string;
        TransactionID?: string;
        ResultParameters?: {
          ResultParameter?: Array<{ Key: string; Value?: unknown }>;
        };
      };
    };

    const result = b?.Result;
    if (!result) return null;

    const params = result.ResultParameters?.ResultParameter ?? [];
    const getParam = (key: string) =>
      params.find((p) => p.Key === key)?.Value ?? null;

    return {
      resultCode: result.ResultCode ?? -1,
      resultDesc: result.ResultDesc ?? "",
      conversationId: result.ConversationID ?? "",
      transactionId: result.TransactionID ?? null,
      receiverPartyPublicName: getParam("ReceiverPartyPublicName") as string | null,
      transactionAmount: getParam("TransactionAmount") as number | null,
      b2cUtilityAccountAvailableFunds: getParam(
        "B2CUtilityAccountAvailableFunds"
      ) as number | null,
    };
  } catch {
    return null;
  }
}
