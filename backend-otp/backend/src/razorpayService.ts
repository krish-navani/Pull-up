import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from './config.js';

let razorpayInstance: Razorpay | null = null;

export const getRazorpay = (): Razorpay => {
  if (!razorpayInstance) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('RAZORPAY_NOT_CONFIGURED');
    }
    razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpayInstance;
};

/**
 * Creates a Razorpay Order with payment_capture: 1 (Auto-capture).
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string; status: string }> {
  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount: Math.round(params.amountPaise),
    currency: 'INR',
    receipt: params.receipt,
    payment_capture: true, // Automatic capture upon successful authorization
    notes: params.notes || {},
  });
  return order as any;
}

function safeTimingEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies Razorpay payment signature (orderId + "|" + paymentId).
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!params.orderId || !params.paymentId || !params.signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return safeTimingEquals(expectedSignature, params.signature);
}

/**
 * Verifies Razorpay subscription signature (paymentId + "|" + subscriptionId).
 */
export function verifySubscriptionSignature(params: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!params.subscriptionId || !params.paymentId || !params.signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${params.paymentId}|${params.subscriptionId}`)
    .digest('hex');
  return safeTimingEquals(expectedSignature, params.signature);
}

/**
 * Verifies Razorpay webhook signature using raw body and secret.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = config.razorpay.webhookSecret;
  if (!secret || !signature || !rawBody) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return safeTimingEquals(expectedSignature, signature);
}

/**
 * Fetches Razorpay Payment details.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<any> {
  const rzp = getRazorpay();
  return await rzp.payments.fetch(paymentId);
}

/**
 * Manually captures authorized Razorpay Payment if not auto-captured.
 */
export async function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<any> {
  const rzp = getRazorpay();
  return await rzp.payments.capture(paymentId, Math.round(amountPaise), 'INR');
}

/**
 * Creates a real Razorpay Refund for a captured payment.
 */
export async function createRazorpayRefund(params: {
  paymentId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}): Promise<any> {
  const rzp = getRazorpay();
  return await (rzp.payments as any).refund(params.paymentId, {
    amount: Math.round(params.amountPaise),
    notes: params.notes || {},
  });
}

/**
 * Creates a Razorpay Route Direct Transfer from a captured payment to a driver's Linked Account.
 */
export async function createRouteTransfer(params: {
  paymentId: string;
  accountId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}): Promise<any> {
  const rzp = getRazorpay();
  const transferResponse = await (rzp.payments as any).transfer(params.paymentId, {
    transfers: [
      {
        account: params.accountId,
        amount: Math.round(params.amountPaise),
        currency: 'INR',
        notes: params.notes || {},
      },
    ],
  });
  const items = transferResponse?.items || transferResponse?.transfers || [];
  return items.length > 0 ? items[0] : transferResponse;
}

/**
 * Reverses a Razorpay Route transfer.
 */
export async function reverseRouteTransfer(params: {
  transferId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}): Promise<any> {
  const rzp = getRazorpay();
  const payload: any = { notes: params.notes || {} };
  if (params.amountPaise && params.amountPaise > 0) {
    payload.amount = Math.round(params.amountPaise);
  }
  return await (rzp.transfers as any).reverse(params.transferId, payload);
}

/**
 * Helper to fetch or create a Razorpay Route Linked Account via Razorpay V2 Accounts API using Basic Auth.
 */
export async function createOrLinkRazorpayAccount(params: {
  email: string;
  phone?: string;
  name: string;
  existingAccountId?: string;
}): Promise<{ accountId: string; status: string }> {
  if (params.existingAccountId && params.existingAccountId.startsWith('acc_')) {
    // Validate account format
    return { accountId: params.existingAccountId, status: 'active' };
  }

  // Use Razorpay V2 Accounts API endpoint via fetch / HTTP basic auth
  const authHeader = 'Basic ' + Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v2/accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify({
      email: params.email,
      phone: params.phone || '',
      legal_business_name: params.name,
      business_type: 'individual',
      contact_name: params.name,
      profile: {
        category: 'transportation',
        subcategory: 'cab_services',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[RAZORPAY ROUTE ACCOUNT] Failed to create linked account:', errText);
    throw new Error(`RAZORPAY_ACCOUNT_CREATION_FAILED: ${response.statusText}`);
  }

  const data: any = await response.json();
  return {
    accountId: data.id,
    status: data.status || 'created',
  };
}
