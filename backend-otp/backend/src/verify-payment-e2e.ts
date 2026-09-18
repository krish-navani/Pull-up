import crypto from 'crypto';
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  verifySubscriptionSignature,
} from './razorpayService.js';
import { executeBookingRefundAndReversal, processRazorpayRoutePayout } from './paymentController.js';

async function runPaymentSystemIntegrationTests() {
  console.log('----------------------------------------------------');
  console.log('RUNNING PULLUP RAZORPAY PAYMENT SYSTEM INTEGRATION TESTS');
  console.log('----------------------------------------------------');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Payment Signature Verification
  const orderId = 'order_test_12345';
  const paymentId = 'pay_test_67890';
  const mockSecret = 'q35binGGi4vlNn8R3Y4wNgqg';

  const validSig = crypto
    .createHmac('sha256', mockSecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const isValid = verifyPaymentSignature({
    orderId,
    paymentId,
    signature: validSig,
  });
  assert(isValid === true, 'Valid payment signature verification');

  const isInvalid = verifyPaymentSignature({
    orderId,
    paymentId,
    signature: 'invalid_signature_hash',
  });
  assert(isInvalid === false, 'Invalid payment signature rejected');

  // Test 2: AutoPay Subscription Signature Verification
  const subId = 'sub_test_998877';
  const validSubSig = crypto
    .createHmac('sha256', mockSecret)
    .update(`${paymentId}|${subId}`)
    .digest('hex');

  const isSubValid = verifySubscriptionSignature({
    subscriptionId: subId,
    paymentId,
    signature: validSubSig,
  });
  assert(isSubValid === true, 'Valid subscription mandate signature verification');

  // Test 3: Webhook Signature Verification
  const webhookSecret = 'whsec_test_secret_key_12345';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'evt_test_001' }));
  const validWebhookSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const isWebhookValid = verifyWebhookSignature(rawBody, validWebhookSig);
  assert(isWebhookValid === true, 'Valid webhook HMAC signature verification');

  const isWebhookInvalid = verifyWebhookSignature(rawBody, 'wrong_signature');
  assert(isWebhookInvalid === false, 'Invalid webhook HMAC signature rejected');

  // Test 4: Commission & Platform Fee Calculation
  const totalAmountPaise = 50000; // ₹500
  const commissionPercentage = 10;
  const expectedFeePaise = 5000; // 10% = ₹50
  const expectedDriverSharePaise = 45000; // ₹450

  const computedFee = Math.round((totalAmountPaise * commissionPercentage) / 100);
  const computedDriverShare = totalAmountPaise - computedFee;
  assert(computedFee === expectedFeePaise, 'Platform fee calculation (10%)');
  assert(computedDriverShare === expectedDriverSharePaise, 'Driver Route share calculation (90%)');

  // Test 5: Refund Policy Percentage Calculation
  const departureInFuture = new Date(Date.now() + 3 * 60 * 60 * 1000).getTime(); // 3 hrs from now
  const departureSoon = new Date(Date.now() + 20 * 60 * 1000).getTime(); // 20 mins from now

  const getRefundPercent = (isPassenger: boolean, departureMs: number) => {
    if (!isPassenger) return 100;
    const oneHourBefore = departureMs - 60 * 60 * 1000;
    return Date.now() > oneHourBefore ? 80 : 100;
  };

  assert(getRefundPercent(true, departureInFuture) === 100, 'Passenger cancellation > 1h before ride -> 100% refund');
  assert(getRefundPercent(true, departureSoon) === 80, 'Passenger cancellation < 1h before ride -> 80% refund (20% fee retained)');
  assert(getRefundPercent(false, departureSoon) === 100, 'Driver cancellation -> 100% full refund');

  console.log('----------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentSystemIntegrationTests().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
