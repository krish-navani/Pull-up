const { config } = require('../../backend/dist/config.js');

module.exports = async (req, res) => {
  const { type, orderId, amount, userId, planId, bookingId } = req.query;

  if (!orderId || !amount) {
    return res.status(400).send('<h1>Error: Missing required parameters orderId or amount.</h1>');
  }

  const keyId = process.env.RAZORPAY_KEY_ID || config.razorpay.keyId;

  // Render HTML with Razorpay checkout script
  res.setHeader('Content-Type', 'text/html');
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PullUp Secure Payment</title>
  <style>
    body {
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.05em;
      margin-bottom: 24px;
      background: linear-gradient(to right, #38bdf8, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      border-top: 3px solid #3b82f6;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 {
      margin-top: 0;
      font-size: 20px;
      font-weight: 600;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #2563eb;
    }
    .error {
      color: #f87171;
      margin-top: 16px;
      font-size: 14px;
      display: none;
    }
  </style>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
  <div class="card">
    <div class="logo">PullUp</div>
    <div id="loader" class="spinner"></div>
    <h2 id="title">Opening Secure Checkout...</h2>
    <p id="desc">Please wait while we connect to Razorpay. If checkout does not open automatically, click the button below.</p>
    <button id="pay-btn" class="btn" style="display: none;">Retry Checkout</button>
    <div id="error-msg" class="error"></div>
  </div>

  <script>
    const options = {
      key: "${keyId}",
      amount: "${amount}",
      currency: "INR",
      name: "PullUp",
      description: "${type === 'subscription' ? 'TaxiPool Subscription' : 'CarPool Prepaid Booking'}",
      order_id: "${orderId}",
      handler: async function (response) {
        document.getElementById('loader').style.display = 'block';
        document.getElementById('title').innerText = 'Verifying payment...';
        document.getElementById('desc').innerText = 'Please wait while we confirm your payment.';
        
        try {
          const verifyUrl = "${type === 'subscription' ? '/api/otp/verify-subscription' : '/api/otp/verify-payment'}";
          const payload = {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            userId: "${userId || ''}",
            planId: "${planId || ''}",
            bookingId: "${bookingId || ''}"
          };

          const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.success) {
            window.location.href = "${type === 'subscription' ? 'pullup://subscription-success' : `pullup://booking-success?bookingId=${bookingId}`}";
          } else {
            showError(data.message || 'Payment verification failed');
            setTimeout(() => {
              window.location.href = 'pullup://payment-failed';
            }, 3000);
          }
        } catch (err) {
          showError('Network error during payment verification');
          setTimeout(() => {
            window.location.href = 'pullup://payment-failed';
          }, 3000);
        }
      },
      modal: {
        ondismiss: async function() {
          if ("${type}" === 'booking') {
            try {
              await fetch('/api/otp/cancel-pending-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: "${bookingId || ''}" })
              });
            } catch (e) {
              console.error('Cancel booking call failed:', e);
            }
          }
          window.location.href = 'pullup://payment-cancelled';
        }
      },
      theme: {
        color: "#3b82f6"
      }
    };

    const rzp = new Razorpay(options);

    function showError(msg) {
      document.getElementById('loader').style.display = 'none';
      document.getElementById('title').innerText = 'Payment Issue';
      document.getElementById('desc').innerText = 'There was a problem processing your payment.';
      const errDiv = document.getElementById('error-msg');
      errDiv.innerText = msg;
      errDiv.style.display = 'block';
      document.getElementById('pay-btn').style.display = 'block';
    }

    document.getElementById('pay-btn').onclick = function() {
      document.getElementById('error-msg').style.display = 'none';
      document.getElementById('pay-btn').style.display = 'none';
      document.getElementById('loader').style.display = 'block';
      document.getElementById('title').innerText = 'Opening Checkout...';
      rzp.open();
    };

    window.onload = function() {
      try {
        rzp.open();
      } catch (err) {
        showError('Could not open payment window. Please click the button below to retry.');
      }
    };
  </script>
</body>
</html>
  `);
};
