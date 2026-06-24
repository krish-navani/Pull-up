import { Request, Response, Router } from 'express';
import { config } from './config.js';
import { sendOTPEmail } from './emailService.js';
import { rateLimiter, validateEmail, validateOTP } from './middleware.js';
import { sendOTP, verifyOTP } from './otpService.js';
import { getDb } from './firebase.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import admin from 'firebase-admin';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: config.nodeEnv,
  });
});

// GET HTML CHECKOUT PAGE (Razorpay Web Checkout integration)
router.get('/checkout-page', (req: Request, res: Response) => {
  const { type, orderId, amount, userId, planId, bookingId } = req.query;

  if (!orderId || !amount) {
    return res.status(400).send('<h1>Error</h1><p>Missing required payment parameters (orderId, amount).</p>');
  }

  const keyId = config.razorpay.keyId;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Securing Payment - PullUp</title>
  <style>
    body {
      background-color: #1e120d;
      color: #fffbf7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
      text-align: center;
    }
    .container {
      max-width: 400px;
      padding: 32px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    }
    .spinner {
      width: 56px;
      height: 56px;
      border: 4px solid rgba(212, 80, 10, 0.15);
      border-top-color: #D4500A;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 12px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p {
      color: #a89f9b;
      font-size: 14px;
      margin: 0 0 24px;
      line-height: 1.5;
    }
    .btn {
      background-color: #D4500A;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      display: none;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #bb4307;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="loader"></div>
    <h1 id="status-title">Preparing Checkout</h1>
    <p id="status-desc">Redirecting you to the secure payment gateway...</p>
    <button class="btn" id="retry-btn" onclick="openPayment()">Pay Now</button>
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    const type = "${type || ''}";
    const orderId = "${orderId}";
    const amount = parseInt("${amount}", 10);
    const userId = "${userId || ''}";
    const planId = "${planId || ''}";
    const bookingId = "${bookingId || ''}";
    const keyId = "${keyId}";

    if (!orderId || !amount) {
      showError("Invalid payment configuration. Missing order parameters.");
    } else {
      setTimeout(openPayment, 800);
    }

    function showError(msg) {
      document.getElementById('loader').style.animation = 'none';
      document.getElementById('loader').style.borderTopColor = '#e53e3e';
      document.getElementById('status-title').innerText = "Payment Error";
      document.getElementById('status-title').style.color = '#e53e3e';
      document.getElementById('status-desc').innerText = msg;
      setTimeout(() => {
        window.location.href = "pullup://payment-failed";
      }, 3000);
    }

    let rzp;
    function openPayment() {
      const options = {
        key: keyId,
        amount: amount,
        currency: "INR",
        name: "PullUp",
        description: type === 'subscription' ? "Driver Subscription (" + planId + ")" : "Ride Booking",
        order_id: orderId,
        theme: { color: "#D4500A" },
        modal: {
          ondismiss: function() {
            window.location.href = "pullup://payment-cancelled";
          }
        },
        handler: function(response) {
          verifyPayment(response);
        }
      };
      
      try {
        rzp = new Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          showError("Transaction failed: " + (resp.error.description || "Unknown error"));
        });
        rzp.open();
        
        document.getElementById('status-title').innerText = "Waiting for Payment";
        document.getElementById('status-desc').innerText = "Please complete the payment in the secure overlay.";
        document.getElementById('retry-btn').style.display = 'inline-block';
      } catch(err) {
        showError("Could not initialize payment: " + err.message);
      }
    }

    function verifyPayment(rzpResponse) {
      document.getElementById('retry-btn').style.display = 'none';
      document.getElementById('loader').style.animation = 'spin 1s linear infinite';
      document.getElementById('loader').style.borderTopColor = '#D4500A';
      document.getElementById('status-title').innerText = "Verifying Payment";
      document.getElementById('status-desc').innerText = "Almost done! Confirming transaction with our servers...";

      const verifyUrl = type === 'subscription' ? '/api/otp/verify-subscription' : '/api/otp/verify-payment';
      const payload = type === 'subscription' 
        ? {
            razorpay_payment_id: rzpResponse.razorpay_payment_id,
            razorpay_order_id: rzpResponse.razorpay_order_id,
            razorpay_signature: rzpResponse.razorpay_signature,
            userId: userId,
            planId: planId
          }
        : {
            razorpay_payment_id: rzpResponse.razorpay_payment_id,
            razorpay_order_id: rzpResponse.razorpay_order_id,
            razorpay_signature: rzpResponse.razorpay_signature,
            bookingId: bookingId
          };

      fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          document.getElementById('loader').style.borderTopColor = '#38a169';
          document.getElementById('status-title').innerText = "Payment Successful!";
          document.getElementById('status-title').style.color = '#38a169';
          document.getElementById('status-desc').innerText = "Redirecting you back to the app...";
          
          setTimeout(() => {
            window.location.href = type === 'subscription' ? "pullup://subscription-success" : "pullup://booking-success";
          }, 1500);
        } else {
          showError(data.message || "Verification failed");
        }
      })
      .catch(err => {
        showError("Server validation failed: " + err.message);
      });
    }
  </script>
</body>
</html>`;

  res.send(html);
});

// NOTIFY ADMIN — new license submission
router.post('/notify-license-submission', async (req: Request, res: Response) => {
  try {
    const { userId, userName, userEmail, licenseImageUrl } = req.body;

    if (!userId || !licenseImageUrl) {
      return res.status(400).json({ success: false, message: 'userId and licenseImageUrl are required' });
    }

    const { getMailer } = await import('./emailService.js');
    const mailer = getMailer();
    const fromAddress = (config.mail.user || '').trim();
    const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#D4500A 0%,#b33d08 100%);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">🚗 PullUp Admin</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">License Verification Request</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">New Submission</p>
            <h2 style="margin:0 0 24px;color:#1e293b;font-size:20px;font-weight:800;">Action Required: Review Driver License</h2>

            <!-- User Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;">
                  <span style="color:#64748b;font-size:13px;font-weight:600;">Driver Name</span><br>
                  <span style="color:#1e293b;font-size:15px;font-weight:700;">${userName || 'Unknown'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;font-weight:600;">Email</span><br>
                  <span style="color:#1e293b;font-size:15px;">${userEmail || 'Not provided'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;font-weight:600;">User ID</span><br>
                  <span style="color:#94a3b8;font-size:13px;font-family:monospace;">${userId}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;font-weight:600;">Submitted At</span><br>
                  <span style="color:#1e293b;font-size:15px;">${submittedAt} IST</span>
                </td>
              </tr>
            </table>

            <!-- License Image -->
            <p style="margin:0 0 12px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">License Image</p>
            <a href="${licenseImageUrl}" target="_blank" style="display:block;margin-bottom:24px;border-radius:12px;overflow:hidden;border:2px solid #e2e8f0;text-decoration:none;">
              <img src="${licenseImageUrl}" alt="Driver License" style="width:100%;max-height:280px;object-fit:cover;display:block;" />
              <div style="background:#f8fafc;padding:10px 16px;text-align:center;">
                <span style="color:#D4500A;font-size:13px;font-weight:600;">🔍 Click to view full image</span>
              </div>
            </a>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr>
                <td width="48%" style="padding-right:8px;">
                  <a href="http://localhost:8000" target="_blank"
                     style="display:block;background:#D4500A;color:#ffffff;text-align:center;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
                    ✅ Open Admin Panel
                  </a>
                </td>
                <td width="4%"></td>
                <td width="48%" style="padding-left:8px;">
                  <a href="${licenseImageUrl}" target="_blank"
                     style="display:block;background:#f8fafc;color:#1e293b;text-align:center;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;border:1.5px solid #e2e8f0;">
                    🖼 View License
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
              This is an automated notification from PullUp. Please log into the admin panel to approve or reject this submission.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
              PullUp Admin • License Management System
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await mailer.sendMail({
      from: `"PullUp Admin" <${fromAddress}>`,
      to: 'krish@pullupapp.in',
      subject: `🚗 License Review Required — ${userName || 'New Driver'} (${submittedAt})`,
      html,
      text: `New license submission from ${userName || 'Unknown'} (${userEmail}). User ID: ${userId}. Submitted at: ${submittedAt} IST. License image: ${licenseImageUrl}. Open admin panel to approve/reject.`,
    });

    // Log to Firestore audit trail
    try {
      const db = getDb();
      await db.collection('adminNotifications').add({
        type: 'license_submission',
        userId,
        userName: userName || null,
        userEmail: userEmail || null,
        licenseImageUrl,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        notifiedTo: 'krish@pullupapp.in',
      });
    } catch (auditErr) {
      console.warn('[NOTIFY] Audit log failed (non-fatal):', auditErr);
    }

    console.log(`[NOTIFY] License submission email sent for user ${userId}`);
    res.json({ success: true, message: 'Admin notified' });
  } catch (error: any) {
    console.error('[NOTIFY] /notify-license-submission error:', error);
    // Return success anyway — don't fail the upload if email fails
    res.json({ success: false, message: 'Notification failed but upload is saved', error: error.message });
  }
});

// Send OTP endpoint

router.post('/send-otp', rateLimiter, async (req: Request, res: Response) => {
  const requestReceivedTime = Date.now();
  console.log(`[OTP REQUEST RECEIVED] [${new Date(requestReceivedTime).toISOString()}] Email: ${req.body?.email}`);
  try {
    const { email } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      const responseTime = Date.now();
      console.log(`[RESPONSE SENT TO CLIENT] [${new Date(responseTime).toISOString()}] Status: 400 (Invalid email, total time: ${responseTime - requestReceivedTime}ms)`);
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
      });
    }

    const fullEmail = email.includes('@') ? email : email + config.universityDomain;

    if (!fullEmail.endsWith(config.universityDomain)) {
      const responseTime = Date.now();
      console.log(`[RESPONSE SENT TO CLIENT] [${new Date(responseTime).toISOString()}] Status: 400 (Invalid email domain, total time: ${responseTime - requestReceivedTime}ms)`);
      return res.status(400).json({
        success: false,
        code: 'INVALID_DOMAIN',
        message: `Only university emails ending with ${config.universityDomain} are permitted`,
      });
    }

    // Validate email format
    if (!validateEmail(fullEmail)) {
      const responseTime = Date.now();
      console.log(`[RESPONSE SENT TO CLIENT] [${new Date(responseTime).toISOString()}] Status: 400 (Invalid email format, total time: ${responseTime - requestReceivedTime}ms)`);
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL_FORMAT',
        message: 'Invalid email format',
      });
    }

    // Generate and save OTP
    const otpResult = await sendOTP(fullEmail);
    const otpGeneratedTime = Date.now();
    if (config.nodeEnv !== 'production') {
      console.log(`[OTP GENERATED] [${new Date(otpGeneratedTime).toISOString()}] Code: ${otpResult.otp} (took ${otpGeneratedTime - requestReceivedTime}ms)`);
    } else {
      console.log(`[OTP GENERATED] [${new Date(otpGeneratedTime).toISOString()}] OTP issued (took ${otpGeneratedTime - requestReceivedTime}ms)`);
    }

    // Send OTP via email (acting as SMS/delivery provider)
    try {
      const emailStartTime = Date.now();
      console.log(`[SMS/EMAIL PROVIDER CALLED] [${new Date(emailStartTime).toISOString()}] Sending to: ${fullEmail}`);
      await sendOTPEmail(fullEmail, otpResult.otp, config.otp.expiryMinutes);
      const emailEndTime = Date.now();
      console.log(`[SMS/EMAIL PROVIDER SUCCESS] [${new Date(emailEndTime).toISOString()}] Sent successfully (took ${emailEndTime - emailStartTime}ms)`);
    } catch (emailError: any) {
      console.error(`[SMS/EMAIL PROVIDER ERROR] [${new Date().toISOString()}] Failed:`, emailError.message);
      const responseTime = Date.now();
      console.log(`[RESPONSE SENT TO CLIENT] [${new Date(responseTime).toISOString()}] Status: 500 (Email sending failed, total time: ${responseTime - requestReceivedTime}ms)`);
      return res.status(500).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: `OTP was generated in database, but email delivery failed: ${emailError.message}`,
      });
    }

    const finalResponseTime = Date.now();
    console.log(`[RESPONSE SENT TO CLIENT] [${new Date(finalResponseTime).toISOString()}] Status: 200 (Success, total time: ${finalResponseTime - requestReceivedTime}ms)`);
    res.json({
      success: true,
      message: 'OTP sent to your email',
    });
  } catch (error: any) {
    console.error('[API] /send-otp error:', error);
    const responseTime = Date.now();
    console.log(`[RESPONSE SENT TO CLIENT] [${new Date(responseTime).toISOString()}] Status: 500 (Server error, total time: ${responseTime - requestReceivedTime}ms)`);
    res.status(500).json({
      success: false,
      code: error.code || 'OTP_SEND_ERROR',
      message: error.message || 'Failed to send OTP',
    });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
      });
    }

    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'OTP is required',
      });
    }

    const fullEmail = email.includes('@') ? email : email + config.universityDomain;

    if (!fullEmail.endsWith(config.universityDomain)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DOMAIN',
        message: `Only university emails ending with ${config.universityDomain} are permitted`,
      });
    }

    // Validate email format
    if (!validateEmail(fullEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL_FORMAT',
        message: 'Invalid email format',
      });
    }

    // Validate OTP format
    if (!validateOTP(otp, config.otp.length)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP_FORMAT',
        message: `OTP must be ${config.otp.length} digits`,
      });
    }

    console.log(`[API] /verify-otp request for: ${fullEmail}`);

    // Verify OTP
    const result = await verifyOTP(fullEmail, otp);

    // Generate custom token and userId if OTP is valid
    let firebaseToken: string | undefined;
    let userId: string | undefined;

    try {
      const db = getDb();
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('email', '==', fullEmail).get();

      if (!snapshot.empty) {
        // Existing user: get their current document ID (uid)
        userId = snapshot.docs[0].id;
        console.log(`[API] Found existing user ID: ${userId} for ${fullEmail}`);
      } else {
        // New user: generate a new unique user ID
        userId = 'usr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        console.log(`[API] Generated new user ID: ${userId} for ${fullEmail}`);
      }

      // Mint a custom Firebase token for this userId
      firebaseToken = await admin.auth().createCustomToken(userId);
      console.log(`[API] Generated custom token successfully for user: ${userId}`);
    } catch (authErr: any) {
      console.error('[API] Error generating custom Firebase token:', authErr);
      // Non-fatal, do not block verification success
    }

    res.json({
      success: true,
      message: result.message,
      userId,
      firebaseToken,
    });
  } catch (error: any) {
    console.error('[API] /verify-otp error:', error);
    res.status(400).json({
      success: false,
      code: error.code || 'OTP_VERIFICATION_ERROR',
      message: error.message || 'Failed to verify OTP',
    });
  }
});

// ==========================================
// PULLUP PAYMENT & WALLET ARCHITECTURE
// ==========================================

let razorpay: any = null;
const getRazorpay = () => {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpay;
};

const logAuditEvent = async (userId: string, action: string, amount: number, details: any) => {
  try {
    const db = getDb();
    await db.collection('auditLogs').add({
      userId,
      action,
      amount,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[AUDIT] Logged action: ${action} for user: ${userId}`);
  } catch (error: any) {
    console.error('[AUDIT] Failed to log audit event:', error.message);
  }
};

// CREATE SUBSCRIPTION ORDER
router.post('/create-subscription', async (req: Request, res: Response) => {
  try {
    const { userId, planId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const plan = planId === 'yearly' ? { price: 2500, days: 365 } : planId === 'quarterly' ? { price: 700, days: 90 } : { price: 250, days: 30 }; // Defaults to monthly

    const rzp = getRazorpay();
    const order = await rzp.orders.create({
      amount: plan.price * 100, // paise
      currency: 'INR',
      receipt: `sub_rcpt_${userId.substring(0, 8)}_${Date.now()}`,
      notes: {
        userId,
        planId: planId || 'monthly',
        planDays: plan.days.toString(),
      }
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      keyId: config.razorpay.keyId,
      planId: planId || 'monthly',
    });
  } catch (error: any) {
    console.error('[API] /create-subscription error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create subscription order' });
  }
});

// VERIFY SUBSCRIPTION PAYMENT
router.post('/verify-subscription', async (req: Request, res: Response) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId) {
      return res.status(400).json({ success: false, message: 'Missing verification details' });
    }

    const generated_signature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature' });
    }

    const db = getDb();
    const plan = planId === 'yearly' ? { price: 2500, days: 365 } : planId === 'quarterly' ? { price: 700, days: 90 } : { price: 250, days: 30 };

    const result = await db.runTransaction(async (transaction) => {
      const subQuery = await transaction.get(db.collection('subscriptions').where('paymentId', '==', razorpay_payment_id));
      if (!subQuery.empty) {
        return { alreadyProcessed: true };
      }

      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userDoc.data()!;
      let baseTime = Date.now();

      if (userData.subscriptionStatus === 'active' && userData.subscriptionExpiry) {
        const exp = new Date(userData.subscriptionExpiry).getTime();
        if (exp > baseTime) {
          baseTime = exp;
        }
      }

      const startTimestamp = admin.firestore.Timestamp.now();
      const expiryTimestamp = admin.firestore.Timestamp.fromDate(new Date(baseTime + plan.days * 24 * 60 * 60 * 1000));

      const subRef = db.collection('subscriptions').doc();
      transaction.set(subRef, {
        userId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amountPaid: plan.price,
        planId: planId || 'monthly',
        planIntervalDays: plan.days,
        subscriptionStatus: 'active',
        subscriptionStart: startTimestamp,
        subscriptionExpiry: expiryTimestamp,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      transaction.update(userRef, {
        subscriptionStatus: 'active',
        subscriptionExpiry: new Date(baseTime + plan.days * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          totalRevenue: (statsData.totalRevenue || 0) + plan.price,
          activeSubscriptions: (statsData.activeSubscriptions || 0) + 1,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.set(statsRef, {
          totalRevenue: plan.price,
          totalCommissions: 0,
          activeSubscriptions: 1,
          pendingWithdrawalsCount: 0,
          pendingWithdrawalsAmount: 0,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { success: true };
    });

    if (!result.alreadyProcessed) {
      await logAuditEvent(userId, 'subscription_created', plan.price, { planId, paymentId: razorpay_payment_id, orderId: razorpay_order_id });
    }

    res.json({ success: true, message: 'Subscription activated successfully' });

  } catch (error: any) {
    console.error('[API] /verify-subscription error:', error);
    res.status(500).json({ success: false, message: error.message || 'Verification failed' });
  }
});

const releaseExpiredBookings = async () => {
  try {
    const db = getDb();
    const now = admin.firestore.Timestamp.now();

    // 1. Check accepted but unpaid bookings
    const acceptedQuery = await db.collection('bookings')
      .where('status', '==', 'accepted')
      .where('paymentStatus', '==', 'pending')
      .get();

    const expiredAcceptedDocs = acceptedQuery.docs.filter(doc => {
      const data = doc.data();
      return data.expiresAt && data.expiresAt.toDate() < now.toDate();
    });

    for (const doc of expiredAcceptedDocs) {
      const bData = doc.data();
      console.log(`[CLEANUP] Releasing expired accepted booking: ${doc.id}`);
      await db.runTransaction(async (transaction) => {
        const bRef = db.collection('bookings').doc(doc.id);
        const rRef = db.collection('rides').doc(bData.rideId);

        const bSnap = await transaction.get(bRef);
        const rSnap = await transaction.get(rRef);

        if (bSnap.exists && bSnap.data()!.status === 'accepted' && bSnap.data()!.paymentStatus === 'pending') {
          transaction.update(bRef, {
            status: 'expired',
            paymentStatus: 'expired',
            updatedAt: admin.firestore.Timestamp.now(),
          });

          if (rSnap.exists) {
            const rData = rSnap.data()!;
            const updatedBookedSeats = (rData.bookedSeats || []).map((bs: any) => {
              if (bs.passengerId === bData.passengerId) {
                return { ...bs, status: 'expired' };
              }
              return bs;
            });
            transaction.update(rRef, {
              bookedSeats: updatedBookedSeats,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }

          // Send notification
          const notificationRef = db.collection('users').doc(bData.passengerId).collection('notifications').doc();
          transaction.set(notificationRef, {
            userId: bData.passengerId,
            type: 'booking_expired',
            title: 'Ride Booking Expired',
            message: `Your booking request expired because payment was not completed within 30 minutes.`,
            rideId: bData.rideId,
            bookingId: doc.id,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });
      await logAuditEvent(bData.passengerId, 'accepted_booking_expired', 0, { bookingId: doc.id, rideId: bData.rideId });
    }

    // 2. Legacy 'payment_pending' bookings cleanup
    const pendingQuery = await db.collection('bookings')
      .where('status', '==', 'payment_pending')
      .get();

    const expiredPendingDocs = pendingQuery.docs.filter(doc => {
      const data = doc.data();
      return data.expiresAt && data.expiresAt.toDate() < now.toDate();
    });

    for (const doc of expiredPendingDocs) {
      const bData = doc.data();
      console.log(`[CLEANUP] Releasing expired payment_pending booking: ${doc.id}`);
      await db.runTransaction(async (transaction) => {
        const bRef = db.collection('bookings').doc(doc.id);
        const rRef = db.collection('rides').doc(bData.rideId);

        const bSnap = await transaction.get(bRef);
        const rSnap = await transaction.get(rRef);

        if (bSnap.exists && bSnap.data()!.status === 'payment_pending') {
          transaction.update(bRef, {
            status: 'cancelled',
            paymentStatus: 'failed',
            updatedAt: admin.firestore.Timestamp.now(),
          });

          if (rSnap.exists) {
            const rData = rSnap.data()!;
            const updatedBookedSeats = (rData.bookedSeats || []).filter(
              (bs: any) => bs.passengerId !== bData.passengerId
            );
            transaction.update(rRef, {
              availableSeats: Math.min(rData.totalSeats, rData.availableSeats + bData.seatsBooked),
              bookedSeats: updatedBookedSeats,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }
        }
      });
      await logAuditEvent(bData.passengerId, 'pending_booking_expired', 0, { bookingId: doc.id, rideId: bData.rideId });
    }
  } catch (error: any) {
    console.error('[CLEANUP] Error during expired bookings release:', error.message);
  }
};

// CREATE CARPOOL ORDER
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    releaseExpiredBookings().catch(err => console.error('[CLEANUP] Async cleanup failed:', err));

    const { bookingId, passengerId } = req.body;

    if (!bookingId || !passengerId) {
      return res.status(400).json({ success: false, message: 'Missing booking parameters' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      const bookingData = bookingSnap.data()!;
      if (bookingData.passengerId !== passengerId) {
        throw new Error('UNAUTHORIZED_BOOKING_ACCESS');
      }

      if (bookingData.status !== 'accepted') {
        throw new Error('BOOKING_NOT_ACCEPTED');
      }

      if (bookingData.paymentStatus === 'paid') {
        throw new Error('BOOKING_ALREADY_PAID');
      }

      const rideId = bookingData.rideId;
      const rideRef = db.collection('rides').doc(rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideSnap.data()!;
      
      if (rideData.status !== 'active') {
        throw new Error('RIDE_NOT_ACTIVE');
      }

      if (rideData.availableSeats < bookingData.seatsBooked) {
        throw new Error('INSUFFICIENT_SEATS');
      }

      const totalAmount = bookingData.totalPrice || (rideData.price * bookingData.seatsBooked);

      const rzp = getRazorpay();
      const order = await rzp.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        receipt: `rcpt_car_${rideId.substring(0, 8)}_${Date.now()}`,
        notes: {
          rideId,
          passengerId,
          seatsBooked: bookingData.seatsBooked.toString(),
          bookingId
        }
      });

      transaction.update(bookingRef, {
        orderId: order.id,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const currentBookedSeats = rideData.bookedSeats || [];
      const updatedBookedSeats = currentBookedSeats.map((b: any) => {
        if (b.passengerId === passengerId) {
          return {
            ...b,
            orderId: order.id
          };
        }
        return b;
      });

      transaction.update(rideRef, {
        bookedSeats: updatedBookedSeats,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return {
        bookingId: bookingSnap.id,
        orderId: order.id,
        amount: order.amount,
        keyId: config.razorpay.keyId,
      };
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('[API] /create-order error:', error);
    let code = 'CREATE_ORDER_FAILED';
    let status = 500;
    let message = error.message || 'Failed to initialize booking payment';

    if (error.message === 'BOOKING_NOT_FOUND') {
      status = 404;
      code = 'BOOKING_NOT_FOUND';
      message = 'Booking not found';
    } else if (error.message === 'BOOKING_NOT_ACCEPTED') {
      status = 400;
      code = 'BOOKING_NOT_ACCEPTED';
      message = 'Booking must be approved by the driver before payment';
    } else if (error.message === 'BOOKING_ALREADY_PAID') {
      status = 400;
      code = 'BOOKING_ALREADY_PAID';
      message = 'This booking has already been paid';
    } else if (error.message === 'UNAUTHORIZED_BOOKING_ACCESS') {
      status = 403;
      code = 'UNAUTHORIZED_BOOKING_ACCESS';
      message = 'Unauthorized to access this booking';
    } else if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    } else if (error.message === 'RIDE_NOT_ACTIVE') {
      status = 400;
      code = 'RIDE_NOT_ACTIVE';
      message = 'Ride is no longer active';
    } else if (error.message === 'INSUFFICIENT_SEATS') {
      status = 400;
      code = 'INSUFFICIENT_SEATS';
      message = 'Requested seat count is no longer available';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// VERIFY PAYMENT & COMPLETE CARPOOL BOOKING
router.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
    }

    const generated_signature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: signature invalid' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      const bookingData = bookingDoc.data()!;

      if (bookingData.status === 'confirmed' && bookingData.paymentStatus === 'paid') {
        return { bookingId, rideId: bookingData.rideId, alreadyProcessed: true };
      }

      if (bookingData.status !== 'accepted') {
        throw new Error('INVALID_BOOKING_STATUS');
      }

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideDoc = await transaction.get(rideRef);

      if (!rideDoc.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideDoc.data()!;

      // Get Chat, Wallet, and Stats references and perform reads BEFORE any writes
      const chatRef = db.collection('rideChats').doc(bookingData.rideId);
      const chatDoc = await transaction.get(chatRef);

      const walletRef = db.collection('wallets').doc(bookingData.driverId);
      const walletDoc = await transaction.get(walletRef);

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);

      // OVERBOOKING PROTECTION: Atomically check if seats are still available
      if (rideData.availableSeats < bookingData.seatsBooked) {
        throw new Error('INSUFFICIENT_SEATS');
      }

      const newAvailableSeats = Math.max(0, rideData.availableSeats - bookingData.seatsBooked);

      const currentBookedSeats = rideData.bookedSeats || [];
      const updatedBookedSeats = currentBookedSeats.map((b: any) => {
        if (b.passengerId === bookingData.passengerId) {
          return {
            ...b,
            status: 'confirmed',
            paymentStatus: 'paid',
            paymentId: razorpay_payment_id,
          };
        }
        return b;
      });

      // Writes begin here:
      transaction.update(bookingRef, {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentId: razorpay_payment_id,
        paidAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      transaction.update(rideRef, {
        availableSeats: newAvailableSeats,
        bookedSeats: updatedBookedSeats,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Update /rideChats document & send system message
      if (chatDoc.exists) {
        transaction.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayUnion(bookingData.passengerId),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        
        const messageRef = chatRef.collection('messages').doc();
        transaction.set(messageRef, {
          rideId: bookingData.rideId,
          senderId: 'system',
          senderName: 'System',
          senderPhoto: '',
          text: `${bookingData.passengerName} joined the ride`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          type: 'system',
        });
      } else {
        transaction.set(chatRef, {
          rideId: bookingData.rideId,
          rideType: 'carpool',
          participants: [bookingData.driverId, bookingData.passengerId],
          lastMessage: 'Group chat created',
          lastMessageTime: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        const messageRef = chatRef.collection('messages').doc();
        transaction.set(messageRef, {
          rideId: bookingData.rideId,
          senderId: 'system',
          senderName: 'System',
          senderPhoto: '',
          text: `${bookingData.passengerName} joined the ride`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          type: 'system',
        });
      }

      if (walletDoc.exists) {
        const wData = walletDoc.data()!;
        transaction.update(walletRef, {
          pendingBalance: (wData.pendingBalance || 0) + bookingData.totalPrice,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.set(walletRef, {
          userId: bookingData.driverId,
          walletBalance: 0,
          pendingBalance: bookingData.totalPrice,
          lockedBalance: 0,
          lifetimeEarnings: 0,
          lifetimeWithdrawals: 0,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          totalRevenue: (statsData.totalRevenue || 0) + bookingData.totalPrice,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { 
        bookingId, 
        rideId: bookingData.rideId, 
        alreadyProcessed: false, 
        passengerId: bookingData.passengerId, 
        passengerName: bookingData.passengerName,
        driverId: bookingData.driverId,
        seatsBooked: bookingData.seatsBooked,
        totalPrice: bookingData.totalPrice 
      };
    });

    if (!result.alreadyProcessed) {
      await logAuditEvent(result.passengerId, 'booking_payment_verified', result.totalPrice, { bookingId, rideId: result.rideId, paymentId: razorpay_payment_id });

      // Send payment success notification to passenger
      await triggerNotification(
        result.passengerId,
        'payment_confirmed',
        'Payment Success 💰',
        `Your payment of INR ${result.totalPrice} was successful and booking is confirmed.`,
        result.rideId,
        bookingId,
        'ride-details',
        result.rideId
      ).catch(e => console.error('[PAYMENT_NOTIF] Passenger notification error:', e));

      // Send booking confirmed notification to driver
      await triggerNotification(
        result.driverId,
        'booking_accepted',
        'New Ride Booking Confirmed',
        `${result.passengerName} paid ₹${result.totalPrice} and booked ${result.seatsBooked} seat(s).`,
        result.rideId,
        bookingId,
        'ride-details',
        result.rideId
      ).catch(e => console.error('[PAYMENT_NOTIF] Driver notification error:', e));
      
      // Check if ride is now full and dispatch capacity reached notifications
      try {
        const freshRideDoc = await db.collection('rides').doc(result.rideId).get();
        const freshRide = freshRideDoc.data();
        if (freshRide && freshRide.availableSeats === 0) {
          // Send notification to Driver
          await triggerNotification(
            freshRide.driverId,
            'pool_full',
            'Ride is Now Full! 🎉',
            `Your ride is now full. All ${freshRide.totalSeats || 0} seats have been booked.`,
            result.rideId,
            null,
            'ride-details',
            result.rideId
          );

          // Send notification to all confirmed passengers
          const confirmedBookings = await db.collection('bookings')
            .where('rideId', '==', result.rideId)
            .where('status', '==', 'confirmed')
            .get();

          for (const cbDoc of confirmedBookings.docs) {
            const cb = cbDoc.data();
            await triggerNotification(
              cb.passengerId,
              'pool_full',
              'Commute Confirmed 🚗',
              `Ride capacity has been reached. Your group commute is fully booked!`,
              result.rideId,
              cbDoc.id,
              'ride-details',
              result.rideId
            );
          }
        }
      } catch (err) {
        console.error('[API] Error sending ride full notifications:', err);
      }
    }

    res.json({
      success: true,
      message: 'Payment verified and booking confirmed successfully',
      bookingId: result.bookingId,
      rideId: result.rideId,
    });

  } catch (error: any) {
    console.error('[API] /verify-payment error:', error);
    let code = 'VERIFY_PAYMENT_FAILED';
    let status = 500;
    let message = error.message || 'Failed to verify payment';

    if (error.message === 'BOOKING_NOT_FOUND') {
      status = 404;
      code = 'BOOKING_NOT_FOUND';
      message = 'Booking not found';
    } else if (error.message === 'INVALID_BOOKING_STATUS') {
      status = 400;
      code = 'INVALID_BOOKING_STATUS';
      message = 'Booking is not in accepted state';
    } else if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    } else if (error.message === 'INSUFFICIENT_SEATS') {
      status = 400;
      code = 'INSUFFICIENT_SEATS';
      message = 'Requested seat count is no longer available';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// CANCEL PENDING BOOKING & RELEASE RESERVED SEATS
router.post('/cancel-pending-booking', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Missing booking ID' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      const bookingData = bookingDoc.data()!;

      if (bookingData.status !== 'payment_pending') {
        throw new Error('CANNOT_CANCEL_NON_PENDING');
      }

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideDoc = await transaction.get(rideRef);

      transaction.update(bookingRef, {
        status: 'cancelled',
        paymentStatus: 'failed',
        updatedAt: admin.firestore.Timestamp.now(),
      });

      if (rideDoc.exists) {
        const rideData = rideDoc.data()!;
        const updatedBookedSeats = (rideData.bookedSeats || []).filter(
          (b: any) => b.passengerId !== bookingData.passengerId
        );

        transaction.update(rideRef, {
          availableSeats: Math.min(rideData.totalSeats, rideData.availableSeats + bookingData.seatsBooked),
          bookedSeats: updatedBookedSeats,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { passengerId: bookingData.passengerId, rideId: bookingData.rideId };
    });

    await logAuditEvent(result.passengerId, 'pending_booking_cancelled', 0, { bookingId, rideId: result.rideId });

    res.json({ success: true, message: 'Pending booking cancelled successfully and seats released' });

  } catch (error: any) {
    console.error('[API] /cancel-pending-booking error:', error);
    let code = 'CANCEL_PENDING_FAILED';
    let status = 500;
    let message = error.message || 'Failed to cancel pending booking';

    if (error.message === 'BOOKING_NOT_FOUND') {
      status = 404;
      code = 'BOOKING_NOT_FOUND';
      message = 'Booking not found';
    } else if (error.message === 'CANNOT_CANCEL_NON_PENDING') {
      status = 400;
      code = 'CANNOT_CANCEL_NON_PENDING';
      message = 'Booking is not in pending payment state';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// SAFE RIDE COMPLETION (Wallet Credit & Commissions)
router.post('/complete-ride', async (req: Request, res: Response) => {
  try {
    const { rideId } = req.body;

    if (!rideId) {
      return res.status(400).json({ success: false, message: 'Ride ID is required' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const rideRef = db.collection('rides').doc(rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideSnap.data()!;

      if (rideData.status === 'completed') {
        return { alreadyProcessed: true };
      }

      if (rideData.status !== 'in_progress') {
        throw new Error('RIDE_NOT_IN_PROGRESS');
      }

      const departureTime = new Date(rideData.departureTime).getTime();
      const tenMinsLater = departureTime + 10 * 60 * 1000;
      
      if (Date.now() < tenMinsLater) {
        throw new Error('TIME_LOCK_ACTIVE');
      }

      const driverId = rideData.driverId;

      transaction.update(rideRef, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const bookingsRef = db.collection('bookings');
      const bookingsQuery = await bookingsRef
        .where('rideId', '==', rideId)
        .where('status', 'in', ['accepted', 'confirmed'])
        .get();

      let totalGrossEarnings = 0;
      let totalDriverPayout = 0;
      let totalCommissions = 0;
      const passengerIds: string[] = [];

      const creditingActions: Array<{ bookingId: string, gross: number, payout: number, commission: number }> = [];

      for (const doc of bookingsQuery.docs) {
        const bData = doc.data();
        if (bData.paymentStatus === 'paid') {
          passengerIds.push(bData.passengerId);
          const gross = bData.totalPrice || 0;
          const commission = parseFloat(((gross * config.commissionPercentage) / 100).toFixed(2));
          const payout = parseFloat((gross - commission).toFixed(2));

          totalGrossEarnings += gross;
          totalDriverPayout += payout;
          totalCommissions += commission;

          creditingActions.push({
            bookingId: doc.id,
            gross,
            payout,
            commission
          });
        }
      }

      if (totalDriverPayout > 0) {
        const walletRef = db.collection('wallets').doc(driverId);
        const walletSnap = await transaction.get(walletRef);
        let walletBalance = 0;
        let pendingBalance = 0;
        let lifetimeEarnings = 0;

        if (walletSnap.exists) {
          const wData = walletSnap.data()!;
          walletBalance = wData.walletBalance || 0;
          pendingBalance = wData.pendingBalance || 0;
          lifetimeEarnings = wData.lifetimeEarnings || 0;

          // Deduct only platform commission from pendingBalance immediately.
          // The remaining payout stays in pendingBalance until cleared.
          const cleanPending = Math.max(0, pendingBalance - totalCommissions);

          transaction.update(walletRef, {
            pendingBalance: cleanPending,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        } else {
          transaction.set(walletRef, {
            userId: driverId,
            walletBalance: 0,
            pendingBalance: totalDriverPayout,
            lockedBalance: 0,
            lifetimeEarnings: 0,
            lifetimeWithdrawals: 0,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }

        for (const action of creditingActions) {
          const txRef = db.collection('walletTransactions').doc();
          const clearingAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
          
          transaction.set(txRef, {
            userId: driverId,
            rideId,
            bookingId: action.bookingId,
            amount: action.payout,
            grossAmount: action.gross,
            commissionAmount: action.commission,
            commissionPercentage: config.commissionPercentage,
            type: 'ride_earning',
            status: 'pending', // Pending 24h clearance
            referenceType: 'ride',
            referenceId: rideId,
            clearingAt,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }

        const statsRef = db.collection('system').doc('stats');
        const statsDoc = await transaction.get(statsRef);
        if (statsDoc.exists) {
          const statsData = statsDoc.data()!;
          transaction.update(statsRef, {
            totalCommissions: (statsData.totalCommissions || 0) + totalCommissions,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      }

      return { alreadyProcessed: false, driverId, totalDriverPayout, rideId, passengerIds };
    });

    if (!result.alreadyProcessed) {
      const payout = result.totalDriverPayout ?? 0;
      if (payout > 0 && result.driverId && result.rideId) {
        await logAuditEvent(result.driverId, 'ride_completed_earnings', payout, { rideId: result.rideId });
      }

      // Notify the driver
      await triggerNotification(
        result.driverId,
        'ride_completed',
        'Ride Completed! 🏁',
        payout > 0 
          ? `Earnings of ₹${payout} will credit in 24h.`
          : 'Your ride has been marked as completed.',
        result.rideId,
        null,
        'ride-details',
        result.rideId
      ).catch(e => console.error('[COMPLETE_RIDE_NOTIF] Driver notification error:', e));

      // Notify confirmed passengers
      if (result.passengerIds && result.passengerIds.length > 0) {
        for (const passengerId of result.passengerIds) {
          await triggerNotification(
            passengerId,
            'ride_completed',
            'Ride Completed! 🏁',
            'Your ride has been completed. Thanks for riding with PullUp!',
            result.rideId,
            null,
            'ride-details',
            result.rideId
          ).catch(e => console.error('[COMPLETE_RIDE_NOTIF] Passenger notification error:', e));
        }
      }
    }

    res.json({ success: true, message: 'Ride completed successfully and driver wallet credited' });

  } catch (error: any) {
    console.error('[API] /complete-ride error:', error);
    let code = 'COMPLETE_RIDE_FAILED';
    let status = 500;
    let message = error.message || 'Failed to complete ride';

    if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    } else if (error.message === 'RIDE_NOT_IN_PROGRESS') {
      status = 400;
      code = 'RIDE_NOT_IN_PROGRESS';
      message = 'Ride is not in progress';
    } else if (error.message === 'TIME_LOCK_ACTIVE') {
      status = 400;
      code = 'TIME_LOCK_ACTIVE';
      message = 'Ride cannot be marked completed until scheduled time + 10 mins';
    }

    res.status(status).json({ success: false, code, message });
  }
});

const clearPendingBalances = async (db: admin.firestore.Firestore, userId: string) => {
  try {
    const now = admin.firestore.Timestamp.now();
    
    let clearedCount = 0;
    let clearedAmount = 0;

    await db.runTransaction(async (transaction) => {
      const pendingTxsQuery = db.collection('walletTransactions')
        .where('userId', '==', userId)
        .where('type', '==', 'ride_earning')
        .where('status', '==', 'pending')
        .where('clearingAt', '<=', now);
        
      const pendingTxsSnap = await transaction.get(pendingTxsQuery);
      
      if (pendingTxsSnap.empty) {
        return;
      }

      let localClearedAmount = 0;
      const txDocsToUpdate: string[] = [];

      for (const doc of pendingTxsSnap.docs) {
        const data = doc.data();
        localClearedAmount += data.amount || 0;
        txDocsToUpdate.push(doc.id);
      }

      if (localClearedAmount > 0) {
        const walletRef = db.collection('wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);

        if (walletSnap.exists) {
          const wData = walletSnap.data()!;
          const currentWalletBalance = wData.walletBalance || 0;
          const currentPendingBalance = wData.pendingBalance || 0;
          const currentLifetimeEarnings = wData.lifetimeEarnings || 0;

          transaction.update(walletRef, {
            walletBalance: parseFloat((currentWalletBalance + localClearedAmount).toFixed(2)),
            pendingBalance: Math.max(0, parseFloat((currentPendingBalance - localClearedAmount).toFixed(2))),
            lifetimeEarnings: parseFloat((currentLifetimeEarnings + localClearedAmount).toFixed(2)),
            updatedAt: admin.firestore.Timestamp.now(),
          });

          for (const txId of txDocsToUpdate) {
            const txRef = db.collection('walletTransactions').doc(txId);
            transaction.update(txRef, {
              status: 'completed',
              clearedAt: admin.firestore.Timestamp.now(),
            });
          }
          
          clearedAmount = localClearedAmount;
          clearedCount = txDocsToUpdate.length;
        }
      }
    });

    if (clearedAmount > 0) {
      console.log(`[CLEARING] Cleared ₹${clearedAmount} for driver ${userId} (${clearedCount} transactions)`);
    }

    return { clearedCount, clearedAmount };
  } catch (error: any) {
    console.error(`[CLEARING] Error clearing pending balance for user ${userId}:`, error.message);
    throw error;
  }
};

// REFRESH WALLET: Clears pending balances and returns wallet data
router.post('/refresh-wallet', async (req: Request, res: Response) => {
  const userId = req.body?.userId;
  console.log(`[REFRESH-WALLET START] UserId: ${userId}`);
  try {
    if (!userId) {
      console.log('[REFRESH-WALLET QUERY FAILED] Error: User ID is required');
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const db = getDb();
    const clearingResult = await clearPendingBalances(db, userId);

    const walletSnap = await db.collection('wallets').doc(userId).get();
    let walletData = {};
    if (walletSnap.exists) {
      walletData = walletSnap.data()!;
    }

    console.log('[REFRESH-WALLET QUERY SUCCESS] Successfully cleared and fetched wallet document.');
    console.log('[REFRESH-WALLET COMPLETED] Returning wallet data.');
    res.json({
      success: true,
      cleared: clearingResult,
      wallet: walletData
    });
  } catch (error: any) {
    console.error('[REFRESH-WALLET QUERY FAILED] Error:', error.message);
    console.error('[API] /refresh-wallet error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to refresh wallet' });
  }
});

// VERIFY UPI & REGISTER PAYOUT METHOD
router.post('/verify-upi', async (req: Request, res: Response) => {
  try {
    const { userId, upiId } = req.body;

    if (!userId || !upiId) {
      return res.status(400).json({ success: false, message: 'Missing user ID or UPI ID' });
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upiId)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format (e.g. name@bank)' });
    }

    const db = getDb();
    
    const payoutMethod = {
      type: 'upi',
      upiId,
      verified: true,
      verifiedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection('users').doc(userId).update({
      payoutMethod,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    await logAuditEvent(userId, 'upi_verified', 0, { upiId });

    res.json({ success: true, message: 'UPI ID verified successfully', payoutMethod });

  } catch (error: any) {
    console.error('[API] /verify-upi error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to verify UPI' });
  }
});

// REQUEST WITHDRAWAL WITH LIMITS & FREQUENCY CONTROLS
router.post('/request-withdrawal', async (req: Request, res: Response) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    if (numAmount < config.withdrawal.minAmount || numAmount > config.withdrawal.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Withdrawals must be between ₹${config.withdrawal.minAmount} and ₹${config.withdrawal.maxAmount}`
      });
    }

    const db = getDb();

    // Dynamically clear any pending balances that are past their 24h clearing window
    await clearPendingBalances(db, userId).catch(err => console.error('[WITHDRAW] Pre-clear error:', err.message));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(startOfToday);

    const withdrawalsToday = await db.collection('withdrawals')
      .where('userId', '==', userId)
      .where('requestedAt', '>=', todayTimestamp)
      .get();

    const successfulOrPendingToday = withdrawalsToday.docs.filter(
      d => d.data().status === 'pending' || d.data().status === 'completed' || d.data().status === 'processing'
    );

    if (successfulOrPendingToday.length >= config.withdrawal.maxPerDay) {
      return res.status(400).json({
        success: false,
        message: `You can only request up to ${config.withdrawal.maxPerDay} withdrawal(s) per day.`
      });
    }

    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userDoc.data()!;
      if (!userData.payoutMethod || !userData.payoutMethod.verified) {
        throw new Error('UNVERIFIED_PAYOUT_METHOD');
      }

      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);

      if (!walletDoc.exists) {
        throw new Error('WALLET_NOT_FOUND');
      }

      const wData = walletDoc.data()!;
      const currentBalance = wData.walletBalance || 0;

      if (currentBalance < numAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      transaction.update(walletRef, {
        walletBalance: parseFloat((currentBalance - numAmount).toFixed(2)),
        lockedBalance: parseFloat(((wData.lockedBalance || 0) + numAmount).toFixed(2)),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const wRef = db.collection('withdrawals').doc();
      const wDataObj = {
        userId,
        amount: numAmount,
        upiId: userData.payoutMethod.upiId,
        status: 'pending',
        requestedAt: admin.firestore.Timestamp.now(),
      };
      transaction.set(wRef, wDataObj);

      const txRef = db.collection('walletTransactions').doc();
      transaction.set(txRef, {
        userId,
        amount: -numAmount,
        type: 'withdrawal',
        status: 'pending',
        referenceType: 'withdrawal',
        referenceId: wRef.id,
        createdAt: admin.firestore.Timestamp.now(),
      });

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          pendingWithdrawalsCount: (statsData.pendingWithdrawalsCount || 0) + 1,
          pendingWithdrawalsAmount: (statsData.pendingWithdrawalsAmount || 0) + numAmount,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { withdrawalId: wRef.id, amount: numAmount };
    });

    await logAuditEvent(userId, 'withdrawal_requested', numAmount, { withdrawalId: result.withdrawalId });

    // Send "withdrawal_requested" notification to driver
    await triggerNotification(
      userId,
      'withdrawal_requested',
      'Withdrawal Requested 💸',
      `Your request to withdraw INR ${numAmount} is pending approval.`,
      null,
      result.withdrawalId,
      'wallet',
      null
    ).catch(e => console.error('[WITHDRAWAL_REQUEST_NOTIF] Notification failed:', e));

    res.json({ success: true, message: 'Withdrawal request submitted successfully', withdrawalId: result.withdrawalId });

  } catch (error: any) {
    console.error('[API] /request-withdrawal error:', error);
    let code = 'WITHDRAWAL_FAILED';
    let status = 500;
    let message = error.message || 'Failed to submit withdrawal request';

    if (error.message === 'USER_NOT_FOUND') {
      status = 404;
      code = 'USER_NOT_FOUND';
      message = 'User profile not found';
    } else if (error.message === 'UNVERIFIED_PAYOUT_METHOD') {
      status = 400;
      code = 'UNVERIFIED_PAYOUT_METHOD';
      message = 'You must add and verify your UPI ID first';
    } else if (error.message === 'WALLET_NOT_FOUND') {
      status = 404;
      code = 'WALLET_NOT_FOUND';
      message = 'Wallet not initialized';
    } else if (error.message === 'INSUFFICIENT_FUNDS') {
      status = 400;
      code = 'INSUFFICIENT_FUNDS';
      message = 'Insufficient funds in wallet';
    }

    res.status(status).json({ success: false, code, message });
  }
});

router.post('/approve-withdrawal', async (req: Request, res: Response) => {
  const { withdrawalId } = req.body;

  if (!withdrawalId) {
    return res.status(400).json({ success: false, message: 'Withdrawal ID is required' });
  }

  try {
    const db = getDb();
    
    // 1. Fetch withdrawal request
    const wRef = db.collection('withdrawals').doc(withdrawalId);
    const wDoc = await wRef.get();
    
    if (!wDoc.exists) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Withdrawal request not found' });
    }

    const wData = wDoc.data()!;
    if (wData.status === 'completed') {
      return res.status(400).json({ success: false, code: 'ALREADY_COMPLETED', message: 'Withdrawal request is already completed' });
    }

    const userId = wData.userId;
    const amount = wData.amount;

    await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);

      // 2. Update withdrawal status
      transaction.update(wRef, {
        status: 'completed',
        completedAt: admin.firestore.Timestamp.now()
      });

      // 3. Update wallet balances
      if (walletDoc.exists) {
        const walletData = walletDoc.data()!;
        transaction.update(walletRef, {
          lockedBalance: parseFloat(Math.max(0, (walletData.lockedBalance || 0) - amount).toFixed(2)),
          lifetimeWithdrawals: parseFloat(((walletData.lifetimeWithdrawals || 0) + amount).toFixed(2)),
          updatedAt: admin.firestore.Timestamp.now()
        });
      }

      // 4. Update system stats
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          pendingWithdrawalsCount: Math.max(0, (statsData.pendingWithdrawalsCount || 0) - 1),
          pendingWithdrawalsAmount: parseFloat(Math.max(0, (statsData.pendingWithdrawalsAmount || 0) - amount).toFixed(2)),
          totalWithdrawalsCount: (statsData.totalWithdrawalsCount || 0) + 1,
          totalWithdrawalsAmount: parseFloat(((statsData.totalWithdrawalsAmount || 0) + amount).toFixed(2)),
          updatedAt: admin.firestore.Timestamp.now()
        });
      }

      // 5. Update wallet transaction status to cleared
      const txQuery = await db.collection('walletTransactions')
        .where('referenceId', '==', withdrawalId)
        .where('type', '==', 'withdrawal')
        .get();
      
      txQuery.forEach(doc => {
        transaction.update(doc.ref, {
          status: 'cleared',
          updatedAt: admin.firestore.Timestamp.now()
        });
      });
    });

    await logAuditEvent(userId, 'withdrawal_approved', amount, { withdrawalId });

    // Send "withdrawal_approved" notification to driver
    await triggerNotification(
      userId,
      'withdrawal_approved',
      'Withdrawal Approved! 💰',
      `Your withdrawal of INR ${amount} has been processed.`,
      null,
      withdrawalId,
      'wallet',
      null
    ).catch(e => console.error('[WITHDRAWAL_APPROVED_NOTIF] Notification failed:', e));

    res.json({ success: true, message: 'Withdrawal approved successfully' });

  } catch (error: any) {
    console.error('[API] /approve-withdrawal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve withdrawal' });
  }
});

// Helper function to send unified notification and push alert
export async function triggerNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  rideId: string | null = null,
  bookingId: string | null = null,
  targetScreen: string | null = null,
  targetId: string | null = null,
  campaignId: string | null = null
): Promise<boolean> {
  try {
    const db = getDb();
    
    // 1. Fetch user to check settings and push token
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data() || {};
    const prefs = userData.notificationPreferences || {
      rideUpdates: true,
      paymentUpdates: true,
      chatUpdates: true,
      poolUpdates: true,
      marketingUpdates: false
    };
    const expoPushToken = userData.expoPushToken;
    const mutedChats = userData.mutedChats || {};

    // Backend Deduplication check (last 5 minutes)
    const fiveMinutesAgoMs = Date.now() - 5 * 60 * 1000;
    try {
      const recentNotifsSnap = await db.collection('users').doc(userId).collection('notifications')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      let isDuplicate = false;
      recentNotifsSnap.forEach(docSnap => {
        const data = docSnap.data();
        const createdTime = data.createdAt 
          ? (data.createdAt.toDate ? data.createdAt.toDate().getTime() : (typeof data.createdAt === 'string' ? new Date(data.createdAt).getTime() : 0)) 
          : 0;
        if (data.type === type && data.rideId === (rideId || null) && createdTime >= fiveMinutesAgoMs) {
          isDuplicate = true;
        }
      });

      if (isDuplicate) {
        console.log(`[DEDUPLICATION] Suppressed duplicate notification of type ${type} for user ${userId} within 5 minutes.`);
        return false;
      }
    } catch (e: any) {
      console.warn('[DEDUPLICATION] Check failed (could be missing index or empty collection), proceeding:', e.message);
    }

    // 2. Map notification type to preference channel
    let isAllowed = true;
    if (['booking_request', 'booking_accepted', 'booking_rejected', 'ride_started', 'ride_completed', 'ride_cancelled', 'booking_expired'].includes(type)) {
      isAllowed = prefs.rideUpdates !== false;
    } else if (['payment_required', 'payment_confirmed', 'refund_initiated', 'refund_completed'].includes(type)) {
      isAllowed = prefs.paymentUpdates !== false;
    } else if (['message'].includes(type)) {
      isAllowed = prefs.chatUpdates !== false;
      const chatId = rideId;
      if (chatId && mutedChats[chatId]) {
        const muteExpires = new Date(mutedChats[chatId]);
        if (muteExpires > new Date()) {
          isAllowed = false; // Chat muted, suppress push alert
        }
      }
    } else if (['pool_joined', 'pool_accepted', 'pool_full', 'pool_request'].includes(type)) {
      isAllowed = prefs.poolUpdates !== false;
    } else if (['marketing', 'campaign'].includes(type)) {
      isAllowed = prefs.marketingUpdates === true;
    }

    // 3. Write in-app notification subcollection
    const timestampSecs = Math.floor(Date.now() / 1000);
    const notificationId = `${rideId || 'general'}_${userId}_${type}_${timestampSecs}`;
    
    const notifRef = db.collection('users').doc(userId).collection('notifications').doc();
    const notifPayload = {
      id: notifRef.id,
      notificationId,
      userId,
      type,
      title,
      message,
      rideId: rideId || null,
      bookingId: bookingId || null,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      targetScreen: targetScreen || null,
      targetId: targetId || null,
      campaignId: campaignId || null
    };
    await notifRef.set(notifPayload);
    console.log(`[NOTIFICATION DELIVERED]\nnotificationId: ${notifRef.id}\nuserId: ${userId}\ntype: ${type}`);

    // 4. Send Expo Push if allowed and token exists
    let pushSent = false;
    if (isAllowed && expoPushToken) {
      try {
        // Calculate unread count for badge syncing
        let unreadCount = 1;
        try {
          const unreadSnap = await db.collection('users').doc(userId).collection('notifications')
            .where('read', '==', false)
            .get();
          unreadCount = unreadSnap.size; // includes the one we just added since it was setDoc'd
        } catch (e) {
          console.warn('[BADGE] Failed to fetch unread count, defaulting to 1:', e);
        }

        const pushPayload = {
          to: expoPushToken,
          sound: 'default',
          title,
          body: message,
          badge: unreadCount,
          data: {
            type,
            rideId: rideId || '',
            bookingId: bookingId || '',
            targetScreen: targetScreen || '',
            targetId: targetId || '',
            campaignId: campaignId || ''
          }
        };

        const fetchFn = (globalThis as any).fetch;
        if (typeof fetchFn === 'function') {
          const expoResponse = await fetchFn('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pushPayload)
          });
          
          if (expoResponse.ok) {
            pushSent = true;
          }
        }
      } catch (err) {
        console.error('[PUSH ERROR] Failed to send push:', err);
      }
    }

    // 5. Update Campaign Analytics if campaignId exists
    if (campaignId) {
      const campRef = db.collection('notificationAnalytics').doc(campaignId);
      await campRef.update({
        sentCount: admin.firestore.FieldValue.increment(1),
        deliveredCount: admin.firestore.FieldValue.increment(pushSent ? 1 : 0)
      }).catch(e => console.error('[ANALYTICS] Campaign updates failed:', e));
    }

    return pushSent;
  } catch (error) {
    console.error('[TRIGGER NOTIFICATION ERROR]', error);
    return false;
  }
}

// ─── Background Location Update (called by TaskManager background task) ───────
// Authenticated via PULLUP_BG_SECRET header to prevent spoofed location writes.
router.post('/update-location', async (req: Request, res: Response) => {
  // Auth check
  const secret = req.headers['x-pullup-bg-secret'];
  const expectedSecret = process.env.PULLUP_BG_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { rideId, latitude, longitude, heading, speed, accuracy } = req.body;

  if (!rideId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields: rideId, latitude, longitude' });
  }

  try {
    const db = getDb();
    const rideRef = db.collection('rides').doc(rideId);
    const rideSnap = await rideRef.get();

    if (!rideSnap.exists) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const rideData = rideSnap.data() || {};
    if (rideData.status !== 'in_progress' && rideData.status !== 'active') {
      return res.status(409).json({ success: false, message: `Ride status is ${rideData.status}, not trackable` });
    }

    const now = new Date().toISOString();
    await rideRef.update({
      currentLocation: { latitude, longitude, updatedAt: now },
      liveLocation: {
        latitude,
        longitude,
        heading: heading ?? 0,
        speed: speed ?? 0,
        accuracy: accuracy ?? null,
        updatedAt: now,
      },
    });

    console.log(`[BG LOCATION] Updated ride ${rideId}: ${latitude.toFixed(5)},${longitude.toFixed(5)} speed=${speed?.toFixed(1)}m/s`);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[BG LOCATION] Error updating location:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// REST route to send unified notification
router.post('/send-notification', async (req: Request, res: Response) => {
  const {
    userId,
    type,
    title,
    message,
    rideId,
    bookingId,
    senderId,
    senderName,
    targetScreen,
    targetId,
    campaignId
  } = req.body;

  if (!userId || !type || !title || !message) {
    return res.status(400).json({ success: false, message: 'Missing required notification fields' });
  }

  try {
    const pushSent = await triggerNotification(
      userId,
      type,
      title,
      message,
      rideId,
      bookingId,
      targetScreen,
      targetId,
      campaignId
    );
    res.json({ success: true, pushSent });
  } catch (error: any) {
    console.error('[ROUTES] /send-notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// REST route to track opened/clicked campaign analytics
router.post('/analytics/track', async (req: Request, res: Response) => {
  const { campaignId, action } = req.body;
  if (!campaignId || !action) {
    return res.status(400).json({ success: false, message: 'Missing campaignId or action' });
  }

  try {
    const db = getDb();
    const campRef = db.collection('notificationAnalytics').doc(campaignId);
    
    const updateData: Record<string, any> = {};
    if (action === 'opened') {
      updateData.openedCount = admin.firestore.FieldValue.increment(1);
      console.log(`[NOTIFICATION OPENED]\nnotificationId: ${campaignId}`);
    } else if (action === 'clicked') {
      updateData.clickedCount = admin.firestore.FieldValue.increment(1);
    }

    await campRef.update(updateData);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[ROUTES] /analytics/track error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to archive a document from source collection to target collection
async function archiveDocument(db: any, sourceCollection: string, targetCollection: string, docId: string) {
  try {
    const sourceRef = db.collection(sourceCollection).doc(docId);
    const docSnap = await sourceRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const targetRef = db.collection(targetCollection).doc(docId);
      await targetRef.set({
        ...data,
        archivedAt: new Date().toISOString(),
        originalCollection: sourceCollection
      });
      await sourceRef.delete();
      console.log(`[ARCHIVE] Moved ${sourceCollection}/${docId} to ${targetCollection}/${docId}`);
    }
  } catch (error) {
    console.error(`[ARCHIVE ERROR] Failed to archive ${sourceCollection}/${docId}:`, error);
  }
}

// Helper to write a system message to a group chat room
async function triggerSystemChatMessage(db: any, rideId: string, text: string) {
  try {
    const chatMsgRef = db.collection('rideChats').doc(rideId).collection('messages').doc();
    await chatMsgRef.set({
      rideId,
      senderId: 'system',
      senderName: 'System',
      senderPhoto: '',
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'system'
    });
  } catch (error) {
    console.error(`[CHAT SYSTEM MSG ERROR] Failed to send system message to ${rideId}:`, error);
  }
}

// REST route to run reminder and campaign scheduled sweeps
router.post('/process-reminders', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const now = new Date();
    console.log(`[REMINDER SWEEP] Starting sweep at: ${now.toISOString()}`);

    // ─── 1. RIDE EXPIRED, CLEANUP, & NO-SHOW SWEEP ───
    const ridesSnapshot = await db.collection('rides').get();
    for (const doc of ridesSnapshot.docs) {
      const ride = doc.data();
      const rideId = doc.id;
      const depTime = new Date(ride.departureTime);
      const diffMs = now.getTime() - depTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // Check if ride has passed departure time
      if (ride.status === 'active') {
        if (diffMs > 0) {
          // Check bookings count
          const bookingsSnap = await db.collection('bookings')
            .where('rideId', '==', rideId)
            .where('status', '==', 'confirmed')
            .where('paymentStatus', '==', 'paid')
            .get();

          const paidCount = bookingsSnap.size;

          if (paidCount === 0) {
            // Empty Car Pool Cleanup
            console.log(`[SWEEP] Empty Car Pool Cleanup for ride: ${rideId}`);
            await doc.ref.update({ status: 'expired', updatedAt: admin.firestore.Timestamp.now() });
            await triggerSystemChatMessage(db, rideId, 'Ride expired (empty car pool)');
            await archiveDocument(db, 'rides', 'archivedRides', rideId);
          } else {
            // Ride Expiry Engine: disable further bookings
            console.log(`[SWEEP] Ride Expiry for ride: ${rideId}`);
            await doc.ref.update({ status: 'expired', updatedAt: admin.firestore.Timestamp.now() });
          }
        }
      }

      // Driver No-Show Logic (departure passed by 30 mins, never started)
      if ((ride.status === 'active' || ride.status === 'expired') && diffMins >= 30) {
        console.log(`[SWEEP] Driver No-Show for ride: ${rideId}`);
        await doc.ref.update({ status: 'no_show', updatedAt: admin.firestore.Timestamp.now() });

        // Notify passengers, process refunds
        const bookingsSnap = await db.collection('bookings')
          .where('rideId', '==', rideId)
          .where('status', '==', 'confirmed')
          .where('paymentStatus', '==', 'paid')
          .get();

        for (const bDoc of bookingsSnap.docs) {
          const booking = bDoc.data();
          const bookingId = bDoc.id;

          await db.runTransaction(async (transaction) => {
            const bRef = db.collection('bookings').doc(bookingId);
            const walletRef = db.collection('wallets').doc(booking.passengerId);

            // Execute all reads first
            const bSnap = await transaction.get(bRef);
            const walletSnap = await transaction.get(walletRef);

            if (!bSnap.exists) return;

            // Now perform all writes
            transaction.update(bRef, {
              status: 'cancelled',
              refundStatus: 'completed',
              refundAmount: booking.totalPrice,
              cancelledAt: now.toISOString(),
              updatedAt: admin.firestore.Timestamp.now()
            });

            let currentBalance = 0;
            if (walletSnap.exists) {
              currentBalance = walletSnap.data()!.walletBalance || 0;
              transaction.update(walletRef, {
                walletBalance: parseFloat((currentBalance + booking.totalPrice).toFixed(2)),
                updatedAt: admin.firestore.Timestamp.now()
              });
            } else {
              transaction.set(walletRef, {
                userId: booking.passengerId,
                walletBalance: booking.totalPrice,
                pendingBalance: 0,
                lockedBalance: 0,
                lifetimeEarnings: 0,
                lifetimeWithdrawals: 0,
                updatedAt: admin.firestore.Timestamp.now()
              });
            }

            // Transaction log
            const txRef = db.collection('walletTransactions').doc();
            transaction.set(txRef, {
              userId: booking.passengerId,
              rideId: rideId,
              bookingId: bookingId,
              amount: booking.totalPrice,
              type: 'refund',
              status: 'cleared',
              referenceType: 'booking',
              referenceId: bookingId,
              createdAt: admin.firestore.Timestamp.now(),
            });
          });

          await triggerNotification(
            booking.passengerId,
            'ride_cancelled',
            'Ride Cancelled: Driver No-Show ⚠️',
            `Your ride departs in ${ride.pickupLocation?.address || 'your area'} was cancelled due to a driver no-show. A refund of INR ${booking.totalPrice} has been credited to your wallet.`,
            rideId,
            bookingId,
            'my-bookings',
            rideId
          );
        }
        await triggerSystemChatMessage(db, rideId, 'Ride marked as Driver No-Show. Chat locked.');
      }
    }

    // ─── 1.5 PASSENGER CANCELLATION REFUND SWEEP ───
    const pendingRefundsSnap = await db.collection('bookings')
      .where('status', '==', 'cancelled')
      .where('refundStatus', '==', 'pending')
      .get();

    for (const bDoc of pendingRefundsSnap.docs) {
      const booking = bDoc.data();
      const bookingId = bDoc.id;
      const refundAmount = booking.refundAmount || booking.totalPrice;

      console.log(`[SWEEP] Processing passenger cancellation refund for booking: ${bookingId}, amount: ₹${refundAmount}`);

      await db.runTransaction(async (transaction) => {
        const bRef = db.collection('bookings').doc(bookingId);
        const walletRef = db.collection('wallets').doc(booking.passengerId);

        // Execute all reads first
        const bSnap = await transaction.get(bRef);
        const walletSnap = await transaction.get(walletRef);

        if (!bSnap.exists) return;
        const bData = bSnap.data()!;
        if (bData.refundStatus !== 'pending') return; // Avoid double processing

        // Now perform all writes
        transaction.update(bRef, {
          refundStatus: 'completed',
          updatedAt: admin.firestore.Timestamp.now()
        });

        let currentBalance = 0;
        if (walletSnap.exists) {
          currentBalance = walletSnap.data()!.walletBalance || 0;
          transaction.update(walletRef, {
            walletBalance: parseFloat((currentBalance + refundAmount).toFixed(2)),
            updatedAt: admin.firestore.Timestamp.now()
          });
        } else {
          transaction.set(walletRef, {
            userId: booking.passengerId,
            walletBalance: refundAmount,
            pendingBalance: 0,
            lockedBalance: 0,
            lifetimeEarnings: 0,
            lifetimeWithdrawals: 0,
            updatedAt: admin.firestore.Timestamp.now()
          });
        }

        // Transaction log
        const txRef = db.collection('walletTransactions').doc();
        transaction.set(txRef, {
          userId: booking.passengerId,
          rideId: booking.rideId,
          bookingId: bookingId,
          amount: refundAmount,
          type: 'refund',
          status: 'cleared',
          referenceType: 'booking',
          referenceId: bookingId,
          createdAt: admin.firestore.Timestamp.now(),
        });
      });

      await triggerNotification(
        booking.passengerId,
        'refund_completed',
        'Refund Completed 💰',
        `Your refund of INR ${refundAmount} for ride cancellation has been successfully credited to your wallet.`,
        booking.rideId,
        bookingId,
        'my-bookings',
        booking.rideId
      );
    }

    // ─── 2. TAXI POOL EXPIRED & NO-SHOW SWEEP ───
    const poolsSnapshot = await db.collection('taxiPools').get();
    for (const doc of poolsSnapshot.docs) {
      const pool = doc.data();
      const poolId = doc.id;
      const depTime = new Date(pool.departureTime);
      const diffMs = now.getTime() - depTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (pool.status === 'OPEN' || pool.status === 'FULL') {
        if (diffMs > 0) {
          const membersSnap = await db.collection('poolMembers').where('poolId', '==', poolId).get();
          const passengerMembers = membersSnap.docs.filter(m => m.data().passengerId !== pool.creatorId);

          if (passengerMembers.length === 0) {
            // Empty Taxi Pool Cleanup
            console.log(`[SWEEP] Empty Taxi Pool Cleanup for pool: ${poolId}`);
            await doc.ref.update({ status: 'expired', updatedAt: admin.firestore.Timestamp.now() });
            await triggerSystemChatMessage(db, poolId, 'Taxi Pool expired (empty pool)');
            await archiveDocument(db, 'taxiPools', 'archivedTaxiPools', poolId);
          } else if (diffMins >= 30) {
            // Taxi Pool No-Show Logic
            console.log(`[SWEEP] Taxi Pool No-Show for pool: ${poolId}`);
            await doc.ref.update({ status: 'expired', updatedAt: admin.firestore.Timestamp.now() });

            for (const mDoc of membersSnap.docs) {
              const member = mDoc.data();
              if (member.passengerId !== pool.creatorId) {
                await triggerNotification(
                  member.passengerId,
                  'pool_joined',
                  'Taxi Pool Cancelled: Owner No-Show ⚠️',
                  `The taxi pool you joined was cancelled because the owner did not start it on time.`,
                  poolId,
                  null,
                  'taxi-pool-details',
                  poolId
                );
              }
            }
            await triggerSystemChatMessage(db, poolId, 'Taxi Pool expired due to owner no-show. Chat locked.');
          }
        }
      }
    }

    // ─── 3. RIDE DEPARTURE REMINDERS (30m / 10m) ───
    const activeRidesSnap = await db.collection('rides').where('status', '==', 'active').get();
    for (const doc of activeRidesSnap.docs) {
      const ride = doc.data();
      const depTime = new Date(ride.departureTime);
      const diffMs = depTime.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // A. 30 Minutes Before Departure
      if (diffMins <= 30 && diffMins > 10 && !ride.reminder30mSent) {
        const bookingsSnap = await db.collection('bookings')
          .where('rideId', '==', doc.id)
          .where('status', '==', 'confirmed')
          .where('paymentStatus', '==', 'paid')
          .get();

        for (const bDoc of bookingsSnap.docs) {
          const booking = bDoc.data();
          await triggerNotification(
            booking.passengerId,
            'ride_started',
            'Ride Departing Soon! ⏰',
            `Your ride departs in 30 minutes. Please be ready at the pickup location.`,
            doc.id,
            bDoc.id,
            'ride-details',
            doc.id
          );
        }

        await triggerNotification(
          ride.driverId,
          'booking_request',
          'Upcoming Departure 🚗',
          `Your ride departs in 30 minutes. You have ${bookingsSnap.size} passenger(s) booked.`,
          doc.id,
          null,
          'ride-details',
          doc.id
        );

        await doc.ref.update({ reminder30mSent: true });
      }

      // B. 10 Minutes Before Departure
      if (diffMins <= 10 && diffMins > 0 && !ride.reminder10mSent) {
        const bookingsSnap = await db.collection('bookings')
          .where('rideId', '==', doc.id)
          .where('status', '==', 'confirmed')
          .where('paymentStatus', '==', 'paid')
          .get();

        for (const bDoc of bookingsSnap.docs) {
          const booking = bDoc.data();
          await triggerNotification(
            booking.passengerId,
            'ride_started',
            'Ride Departing in 10m! 🚗',
            `Your ride departs in 10 minutes. Check your active ride coordinates.`,
            doc.id,
            bDoc.id,
            'ride-details',
            doc.id
          );
        }

        await triggerNotification(
          ride.driverId,
          'booking_request',
          'Upcoming Departure in 10m! 🚗',
          `Your ride departs in 10 minutes. Please prepare to start your ride.`,
          doc.id,
          null,
          'ride-details',
          doc.id
        );

        await doc.ref.update({ reminder10mSent: true });
      }
    }

    // ─── 4. TAXI POOL REMINDERS (30m / 15m) ───
    const activePoolsSnap = await db.collection('taxiPools').where('status', 'in', ['OPEN', 'FULL']).get();
    for (const doc of activePoolsSnap.docs) {
      const pool = doc.data();
      const depTime = new Date(pool.departureTime);
      const diffMs = depTime.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // A. 30 Minutes Before Start
      if (diffMins <= 30 && diffMins > 15 && !pool.poolReminder30mSent) {
        const membersSnap = await db.collection('poolMembers').where('poolId', '==', doc.id).get();
        
        await triggerNotification(
          pool.creatorId,
          'pool_joined',
          'Time to Book Cab! 🚖',
          `Your taxi pool starts in 30 minutes. Please proceed to book your cab.`,
          doc.id,
          null,
          'taxi-pool-details',
          doc.id
        );

        for (const mDoc of membersSnap.docs) {
          const member = mDoc.data();
          if (member.passengerId !== pool.creatorId) {
            await triggerNotification(
              member.passengerId,
              'pool_joined',
              'Taxi Pool Starting 🚖',
              `Your taxi pool starts in 30 minutes. Meet at the pickup gate.`,
              doc.id,
              null,
              'taxi-pool-details',
              doc.id
            );
          }
        }
        await doc.ref.update({ poolReminder30mSent: true });
      }

      // B. 15 Minutes Before Start
      if (diffMins <= 15 && diffMins > 0 && !pool.poolReminder15mSent) {
        await triggerNotification(
          pool.creatorId,
          'pool_joined',
          'Urgent: Start Taxi Pool! 🚖',
          `Your taxi pool starts in 15 minutes. Ensure your cab is booked and start the pool.`,
          doc.id,
          null,
          'taxi-pool-details',
          doc.id
        );
        await doc.ref.update({ poolReminder15mSent: true });
      }
    }

    // ─── 5. UNPAID BOOKING WARNINGS (15m / 5m remaining) ───
    const bookingsSnapshot = await db.collection('bookings')
      .where('status', '==', 'payment_pending')
      .get();

    for (const doc of bookingsSnapshot.docs) {
      const booking = doc.data();
      const bookedTime = new Date(booking.bookedAt);
      const ageMs = now.getTime() - bookedTime.getTime();
      const ageMins = Math.floor(ageMs / 60000);

      if (ageMins >= 15 && ageMins < 25 && !booking.paymentReminder15mSent) {
        await triggerNotification(
          booking.passengerId,
          'payment_required',
          'Complete Payment Required 💳',
          'Complete payment to secure your seat. 15 minutes remaining.',
          booking.rideId,
          doc.id,
          'my-bookings',
          doc.id
        );
        await doc.ref.update({ paymentReminder15mSent: true });
      }

      if (ageMins >= 25 && ageMins < 30 && !booking.paymentReminder5mSent) {
        await triggerNotification(
          booking.passengerId,
          'payment_required',
          'Seat Reservation Expiring! ⚠️',
          'Your seat reservation is about to expire in 5 minutes.',
          booking.rideId,
          doc.id,
          'my-bookings',
          doc.id
        );
        await doc.ref.update({ paymentReminder5mSent: true });
      }
    }

    // ─── 6. ADMIN SCHEDULED CAMPAIGNS SWEEP ───
    const schedSnapshot = await db.collection('scheduledNotifications')
      .where('status', '==', 'pending')
      .get();

    for (const doc of schedSnapshot.docs) {
      const scheduled = doc.data();
      const scheduledTime = new Date(scheduled.scheduledTime.toDate ? scheduled.scheduledTime.toDate() : scheduled.scheduledTime);
      
      if (scheduledTime <= now) {
        let targetUserQuerySnapshot;
        if (scheduled.target === 'drivers') {
          targetUserQuerySnapshot = await db.collection('users').where('role', '==', 'driver').get();
        } else if (scheduled.target === 'passengers') {
          targetUserQuerySnapshot = await db.collection('users').where('role', '==', 'passenger').get();
        } else {
          targetUserQuerySnapshot = await db.collection('users').get();
        }

        for (const userDoc of targetUserQuerySnapshot.docs) {
          await triggerNotification(
            userDoc.id,
            'marketing',
            scheduled.title,
            scheduled.body,
            null,
            null,
            'profile',
            null,
            scheduled.campaignId || doc.id
          );
        }

        await doc.ref.update({ status: 'sent' });
      }
    }

    // ─── 7. COMPLETED RIDES ARCHIVING (Older than 30 Days) ───
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const completedRidesSnap = await db.collection('rides')
      .where('status', '==', 'completed')
      .get();

    for (const doc of completedRidesSnap.docs) {
      const ride = doc.data();
      const completedTime = ride.completedAt ? new Date(ride.completedAt) : new Date(ride.departureTime);
      if (completedTime < thirtyDaysAgo) {
        console.log(`[SWEEP] Archiving completed ride: ${doc.id}`);
        await archiveDocument(db, 'rides', 'archivedRides', doc.id);
      }
    }

    // ─── 8. NOTIFICATION CLEANUP (Older than 90 Days) ───
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const oldNotificationsSnap = await db.collectionGroup('notifications')
        .where('createdAt', '<', ninetyDaysAgo)
        .get();

      console.log(`[SWEEP] Found ${oldNotificationsSnap.size} old notifications to purge.`);
      const purgeBatch = db.batch();
      oldNotificationsSnap.docs.forEach(doc => {
        purgeBatch.delete(doc.ref);
      });
      if (oldNotificationsSnap.size > 0) {
        await purgeBatch.commit();
        deletedCount = oldNotificationsSnap.size;
        console.log(`[SWEEP] Purged ${oldNotificationsSnap.size} old notifications.`);
      }
    } catch (error: any) {
      if (error.message && (error.message.includes('FAILED_PRECONDITION') || error.message.includes('index'))) {
        console.warn('[SWEEP] Missing collectionGroup index for notifications/createdAt. Falling back to per-user notification purge.');
        try {
          const usersSnap = await db.collection('users').get();
          console.log(`[SWEEP-FALLBACK] Processing ${usersSnap.size} users for notification purge...`);

          let batch = db.batch();
          let operationCount = 0;

          for (const userDoc of usersSnap.docs) {
            const userNotifsSnap = await userDoc.ref.collection('notifications')
              .where('createdAt', '<', ninetyDaysAgo)
              .get();

            for (const notifDoc of userNotifsSnap.docs) {
              batch.delete(notifDoc.ref);
              deletedCount++;
              operationCount++;

              if (operationCount >= 400) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
              }
            }
          }

          if (operationCount > 0) {
            await batch.commit();
          }
          console.log(`[SWEEP-FALLBACK] Purged ${deletedCount} old notifications via per-user scan fallback.`);
        } catch (fallbackError: any) {
          console.error('[SWEEP-FALLBACK] Fallback notification purge failed:', fallbackError.message);
          throw fallbackError;
        }
      } else {
        console.error('[SWEEP] Notification cleanup error:', error);
        throw error;
      }
    }

    res.json({ success: true, message: 'Reminders, cleans, and scheduled campaigns processed successfully' });
  } catch (error: any) {
    console.error('[REMINDER SWEEP] Sweep execution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Admin Secret Middleware helper ───────────────────────────────────────────
function isAdminAuthorized(req: Request): boolean {
  const secret = req.headers['x-admin-secret'];
  const expected = process.env.PULLUP_ADMIN_SECRET;
  return !!expected && secret === expected;
}

async function writeAuditLog(db: any, action: string, description: string, adminNote?: string) {
  try {
    await db.collection('auditLogs').add({
      action,
      description,
      adminNote: adminNote || null,
      timestamp: admin.firestore.Timestamp.now(),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[AUDIT LOG] Failed to write audit log:', e);
  }
}

// ─── GET /admin/data — Returns all users, rides, bookings, audit logs ─────────
router.get('/admin/data', async (req: Request, res: Response) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const db = getDb();

    const [usersSnap, ridesSnap, bookingsSnap, auditLogsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('rides').orderBy('createdAt', 'desc').limit(200).get(),
      db.collection('bookings').orderBy('bookedAt', 'desc').limit(500).get(),
      db.collection('auditLogs').orderBy('timestamp', 'desc').limit(100).get(),
    ]);

    const users = usersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const rides = ridesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const bookings = bookingsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const auditLogs = auditLogsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // Aggregate stats
    const stats = {
      totalUsers: users.length,
      totalDrivers: users.filter((u: any) => u.role === 'driver').length,
      totalPassengers: users.filter((u: any) => u.role === 'passenger').length,
      pendingLicenses: users.filter((u: any) => u.licenseVerificationStatus === 'pending').length,
      verifiedDrivers: users.filter((u: any) => u.licenseVerified === true).length,
      rejectedLicenses: users.filter((u: any) => u.licenseVerificationStatus === 'rejected').length,
      totalRides: rides.length,
      activeRides: rides.filter((r: any) => r.status === 'active').length,
      inProgressRides: rides.filter((r: any) => r.status === 'in_progress').length,
      completedRides: rides.filter((r: any) => r.status === 'completed').length,
      cancelledRides: rides.filter((r: any) => r.status === 'cancelled').length,
      totalBookings: bookings.length,
      confirmedBookings: bookings.filter((b: any) => b.status === 'confirmed').length,
      pendingBookings: bookings.filter((b: any) => b.status === 'pending').length,
    };

    return res.json({ success: true, users, rides, bookings, auditLogs, stats });
  } catch (error: any) {
    console.error('[ADMIN DATA] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /admin-action — Handle all admin mutations ─────────────────────────
router.post('/admin-action', async (req: Request, res: Response) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { action, targetId, reason, data } = req.body;

  if (!action) {
    return res.status(400).json({ success: false, message: 'Missing action' });
  }

  const db = getDb();

  try {
    switch (action) {

      case 'APPROVE_LICENSE': {
        if (!targetId) return res.status(400).json({ success: false, message: 'Missing targetId (userId)' });
        await db.collection('users').doc(targetId).update({
          licenseVerified: true,
          licenseVerificationStatus: 'verified',
          licenseRejectionReason: admin.firestore.FieldValue.delete(),
          licenseVerifiedAt: new Date().toISOString(),
        });
        // Notify user
        try {
          const userSnap = await db.collection('users').doc(targetId).get();
          const userData = userSnap.data();
          if (userData?.expoPushToken) {
            const notifRef = db.collection('users').doc(targetId).collection('notifications').doc();
            await notifRef.set({
              id: notifRef.id, type: 'license_verified', title: '🎉 License Approved!',
              message: 'Your driving license has been verified. You can now post rides!',
              read: false, createdAt: new Date().toISOString(),
            });
          }
        } catch (e) { /* non-fatal */ }
        await writeAuditLog(db, 'APPROVE_LICENSE', `Approved license for user ${targetId}`);
        return res.json({ success: true, message: 'License approved' });
      }

      case 'REJECT_LICENSE': {
        if (!targetId) return res.status(400).json({ success: false, message: 'Missing targetId (userId)' });
        await db.collection('users').doc(targetId).update({
          licenseVerified: false,
          licenseVerificationStatus: 'rejected',
          licenseRejectionReason: reason || 'License image is unclear or invalid.',
        });
        // Notify user
        try {
          const notifRef = db.collection('users').doc(targetId).collection('notifications').doc();
          await notifRef.set({
            id: notifRef.id, type: 'license_rejected', title: '⚠️ License Rejected',
            message: reason || 'Your license was rejected. Please re-upload a clear image.',
            read: false, createdAt: new Date().toISOString(),
          });
        } catch (e) { /* non-fatal */ }
        await writeAuditLog(db, 'REJECT_LICENSE', `Rejected license for user ${targetId}`, reason);
        return res.json({ success: true, message: 'License rejected' });
      }

      case 'REQUEST_RESUBMISSION': {
        if (!targetId) return res.status(400).json({ success: false, message: 'Missing targetId (userId)' });
        await db.collection('users').doc(targetId).update({
          licenseVerified: false,
          licenseVerificationStatus: 'resubmission_requested',
          licenseRejectionReason: reason || 'Please re-upload your license with better image quality.',
        });
        try {
          const notifRef = db.collection('users').doc(targetId).collection('notifications').doc();
          await notifRef.set({
            id: notifRef.id, type: 'license_resubmit', title: '📋 License Resubmission Required',
            message: reason || 'Please re-upload your driving license with a clear, well-lit photo.',
            read: false, createdAt: new Date().toISOString(),
          });
        } catch (e) { /* non-fatal */ }
        await writeAuditLog(db, 'REQUEST_RESUBMISSION', `Requested resubmission from user ${targetId}`, reason);
        return res.json({ success: true, message: 'Resubmission requested' });
      }

      case 'CANCEL_RIDE': {
        if (!targetId) return res.status(400).json({ success: false, message: 'Missing targetId (rideId)' });
        await db.collection('rides').doc(targetId).update({
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: reason || 'Cancelled by admin',
        });
        await writeAuditLog(db, 'CANCEL_RIDE', `Cancelled ride ${targetId}`, reason);
        return res.json({ success: true, message: 'Ride cancelled by admin' });
      }

      case 'CHANGE_USER_ROLE': {
        if (!targetId || !data?.role) return res.status(400).json({ success: false, message: 'Missing targetId or data.role' });
        await db.collection('users').doc(targetId).update({ role: data.role });
        await writeAuditLog(db, 'CHANGE_USER_ROLE', `Changed user ${targetId} role to ${data.role}`);
        return res.json({ success: true, message: `User role changed to ${data.role}` });
      }

      case 'FLUSH_DB': {
        const collections = ['rides', 'bookings', 'rideChats'];
        let totalDeleted = 0;
        for (const col of collections) {
          const snap = await db.collection(col).get();
          const batch = db.batch();
          snap.docs.forEach((d: any) => batch.delete(d.ref));
          if (snap.docs.length > 0) {
            await batch.commit();
            totalDeleted += snap.docs.length;
          }
        }
        await writeAuditLog(db, 'FLUSH_DB', `Flushed database — ${totalDeleted} documents deleted`);
        return res.json({ success: true, message: `Database flushed: ${totalDeleted} documents deleted` });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[ADMIN ACTION] Error executing ${action}:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
