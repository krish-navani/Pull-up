let config, initializeFirebase;
let initialized = false;

const initBackend = async () => {
  if (initialized) return;
  
  try {
    const configModule = await import('../../backend/dist/config.js');
    const firebaseModule = await import('../../backend/dist/firebase.js');
    
    config = configModule.config;
    initializeFirebase = firebaseModule.initializeFirebase;
    
    initializeFirebase();
    initialized = true;
    console.log('[HEALTH] Backend initialized');
  } catch (error) {
    console.error('[HEALTH] Init error:', error.message);
    throw error;
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only GET requests are allowed',
    });
  }

  try {
    // Initialize backend on first request
    if (!initialized) {
      await initBackend();
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
      service: 'OTP Verification API',
      version: '1.0.0',
      endpoints: {
        health: 'GET /api/otp',
        sendOtp: 'POST /api/otp/send-otp',
        verifyOtp: 'POST /api/otp/verify-otp'
      },
      config: {
        otpLength: config.otp.length,
        otpExpiryMinutes: config.otp.expiryMinutes,
        universityDomain: config.universityDomain,
      }
    });
  } catch (error) {
    console.error('[HEALTH] Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
module.exports = async (req, res) => {
  // Redirect or handle root /api/otp
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'unknown',
    endpoints: [
      'GET /api/otp - Health check',
      'POST /api/otp/send-otp - Send OTP to email',
      'POST /api/otp/verify-otp - Verify OTP code'
    ]
  });
};
module.exports = async (req, res) => {
  try {
    let path = (req.url || '').split('?')[0]; // Remove query string
    const method = req.method || 'GET';
    
    // Strip /api/otp prefix if present
    if (path.startsWith('/api/otp')) {
      path = path.substring('/api/otp'.length);
    }
    if (path === '') {
      path = '/';
    }
    
    console.log(`[OTP API] ${method} ${path} (full url: ${req.url})`);
    
    // Health check endpoint - matches root or /health
    if (method === 'GET' && (path === '/' || path === '' || path === '/health')) {
      return res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'unknown',
        endpoints: [
          'GET /api/otp - Health check',
          'POST /api/otp/send-otp - Send OTP to email',
          'POST /api/otp/verify-otp - Verify OTP code'
        ]
      });
    }

    // Send OTP endpoint
    if (method === 'POST' && path === '/send-otp') {
      let body = '';
      
      return new Promise((resolve) => {
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const { email } = data;
            
            if (!email) {
              res.status(400).json({
                success: false,
                code: 'INVALID_EMAIL',
                message: 'Email is required. Send JSON: {"email": "user@example.com"}'
              });
              return resolve();
            }

            res.json({
              success: true,
              message: 'OTP sent successfully',
              received: { email },
              note: 'This is a test response. Full OTP email functionality is being integrated.'
            });
            resolve();
          } catch (e) {
            console.error('[OTP API] JSON parse error:', e);
            res.status(400).json({
              success: false,
              code: 'INVALID_JSON',
              message: 'Invalid JSON body'
            });
            resolve();
          }
        });
      });
    }

    // Verify OTP endpoint
    if (method === 'POST' && path === '/verify-otp') {
      let body = '';
      
      return new Promise((resolve) => {
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const { email, otp } = data;
            
            if (!email || !otp) {
              res.status(400).json({
                success: false,
                code: 'MISSING_FIELDS',
                message: 'Email and OTP are required. Send JSON: {"email": "user@example.com", "otp": "1234"}'
              });
              return resolve();
            }

            res.json({
              success: true,
              message: 'OTP verified successfully',
              received: { email, otp },
              note: 'This is a test response. Full OTP verification is being integrated.'
            });
            resolve();
          } catch (e) {
            console.error('[OTP API] JSON parse error:', e);
            res.status(400).json({
              success: false,
              code: 'INVALID_JSON',
              message: 'Invalid JSON body'
            });
            resolve();
          }
        });
      });
    }

    // 404 for other endpoints
    console.log(`[OTP API] 404 - Path not found: ${path}`);
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      receivedPath: path,
      receivedMethod: method,
      availableEndpoints: [
        'GET /api/otp - Health check',
        'POST /api/otp/send-otp - Send OTP',
        'POST /api/otp/verify-otp - Verify OTP'
      ]
    });
  } catch (error) {
    console.error('[OTP API] Unhandled error:', error);
    res.status(500).json({
      success: false,
      code: 'ERROR',
      message: 'Service error: ' + (error.message || 'Unknown'),
      error: process.env.NODE_ENV === 'production' ? undefined : error.toString()
    });
  }
};
