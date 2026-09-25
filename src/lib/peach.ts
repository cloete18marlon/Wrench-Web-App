/**
 * Peach Payments client.
 *
 * CONFIRMED against public docs/search (as of building this):
 * - Auth is OAuth2 client-credentials: POST clientId + clientSecret +
 *   merchantId to the auth token endpoint, get back a short-lived Bearer
 *   access_token, reuse it for Checkout/Payouts/Reconciliation calls.
 * - Webhooks are HMAC-SHA256 signed: the signed message is
 *   `${timestamp}.${url}.${rawBody}`, headers are x-webhook-signature,
 *   x-webhook-timestamp, x-webhook-signature-algorithm.
 *
 * NOT VERIFIED — developer.peachpayments.com was unreachable from the
 * environment this was built in (network egress policy blocked it), so the
 * request/response field names below (amount, currency, merchantTransactionId,
 * notificationUrl, shopperResultUrl, bank account fields, endpoint paths)
 * are best-guess REST-payment-gateway conventions, not confirmed from Peach's
 * actual reference. Check https://developer.peachpayments.com/docs/checkout-payment
 * and https://developer.peachpayments.com/docs/payouts-api-1 and fix up
 * createCheckout()/createPayout() before relying on this against a real
 * (even sandbox) Peach account.
 */

const AUTH_URL = process.env.PEACH_AUTH_URL ?? "https://sandbox-dashboard.peachpayments.com/api/oauth/token";
const API_URL = process.env.PEACH_API_URL ?? "https://testsecure.peachpayments.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.token;
  }

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PEACH_CLIENT_ID,
      clientSecret: process.env.PEACH_CLIENT_SECRET,
      merchantId: process.env.PEACH_MERCHANT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`Peach auth failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export type CreateCheckoutParams = {
  amount: number;
  currency: "ZAR";
  merchantTransactionId: string;
  notificationUrl: string;
  shopperResultUrl: string;
};

export type CreateCheckoutResult = {
  checkoutId: string;
  redirectUrl: string;
};

// TODO(verify): endpoint path and every field name in body/response.
export async function createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      entityId: process.env.PEACH_ENTITY_ID,
      amount: params.amount.toFixed(2),
      currency: params.currency,
      merchantTransactionId: params.merchantTransactionId,
      notificationUrl: params.notificationUrl,
      shopperResultUrl: params.shopperResultUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Peach checkout creation failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { id: string; redirectUrl: string };
  return { checkoutId: data.id, redirectUrl: data.redirectUrl };
}

export type PayoutBankDetails = {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
};

export type CreatePayoutParams = {
  amount: number;
  currency: "ZAR";
  reference: string;
  bankDetails: PayoutBankDetails;
};

export type CreatePayoutResult = {
  payoutId: string;
  status: string;
};

// TODO(verify): endpoint path and every field name in body/response.
export async function createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantId: process.env.PEACH_MERCHANT_ID,
      amount: params.amount.toFixed(2),
      currency: params.currency,
      reference: params.reference,
      recipient: {
        accountHolder: params.bankDetails.accountHolder,
        bankName: params.bankDetails.bankName,
        accountNumber: params.bankDetails.accountNumber,
        branchCode: params.bankDetails.branchCode,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Peach payout creation failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { id: string; status: string };
  return { payoutId: data.id, status: data.status };
}

// CONFIRMED shape (timestamp.url.rawBody, HMAC-SHA256) — this one you can trust.
export async function verifyWebhookSignature(params: {
  rawBody: string;
  url: string;
  timestamp: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = `${params.timestamp}.${params.url}.${params.rawBody}`;
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed.length !== params.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ params.signature.charCodeAt(i);
  }
  return diff === 0;
}
