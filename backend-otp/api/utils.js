const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateOTP = (otp, expectedLength) => {
  return /^\d+$/.test(otp) && otp.length === expectedLength;
};

const parseRequestBody = async (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      // Prevent DoS via large payloads
      if (body.length > 1e6) {
        // 1MB limit
        reject(new Error('Payload too large'));
      }
    });
    
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (e) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    
    req.on('error', reject);
  });
};

module.exports = {
  validateEmail,
  validateOTP,
  parseRequestBody,
};
