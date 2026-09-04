/**
 * verify-environment.js
 *
 * Runs during the EAS post-install build phase to ensure environment variables are correctly loaded
 * and that the production backend is healthy.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse local .env file if running locally and process environment variables are not set
if (!process.env.EXPO_PUBLIC_API_URL) {
  try {
    const dotenvPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(dotenvPath)) {
      const dotenvContent = fs.readFileSync(dotenvPath, 'utf-8');
      dotenvContent.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          process.env[key] = value.trim();
        }
      });
      console.log('[VERIFY-ENV] Loaded environment variables from local .env file.');
    }
  } catch (e) {
    console.warn('[VERIFY-ENV] Could not read local .env file:', e.message);
  }
}

async function runVerification() {
  console.log('[VERIFY-ENV] Running environment configuration check...');

  // 1. Verify required environment variables are set to the correct production URL
  const expectedUrl = 'https://backend-eight-gamma-77.vercel.app';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const otpUrl = process.env.EXPO_PUBLIC_OTP_BACKEND_URL;
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  console.log(`[VERIFY-ENV] EXPO_PUBLIC_API_URL: ${apiUrl}`);
  console.log(`[VERIFY-ENV] EXPO_PUBLIC_OTP_BACKEND_URL: ${otpUrl}`);

  if (apiUrl !== expectedUrl) {
    console.error(`[VERIFY-ENV] ❌ ERROR: EXPO_PUBLIC_API_URL is "${apiUrl}" but expected "${expectedUrl}".`);
    process.exit(1);
  }

  if (otpUrl !== expectedUrl) {
    console.error(`[VERIFY-ENV] ❌ ERROR: EXPO_PUBLIC_OTP_BACKEND_URL is "${otpUrl}" but expected "${expectedUrl}".`);
    process.exit(1);
  }

  if (!googleMapsApiKey) {
    console.error('[VERIFY-ENV] ❌ ERROR: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is required for native builds.');
    process.exit(1);
  }

  console.log('[VERIFY-ENV] ✅ Environment variables verified.');

  // 2. Validate Public Expo Configuration
  try {
    console.log('[VERIFY-ENV] Verifying public Expo configuration output...');
    const expoConfigOutput = execSync('npx expo config --type public', { encoding: 'utf-8' });
    if (!expoConfigOutput.toLowerCase().includes('pullup')) {
      console.warn('[VERIFY-ENV] ⚠️ Warning: Expo config verification returned unexpected output format.');
    } else {
      console.log('[VERIFY-ENV] ✅ Public Expo configuration validated successfully.');
    }
  } catch (expoErr) {
    console.error('[VERIFY-ENV] ❌ ERROR: Failed to query "npx expo config":', expoErr.message);
    process.exit(1);
  }

  // 3. Perform Live Backend Health Check
  const healthCheckUrl = `${otpUrl}/api/otp/health`;
  console.log(`[VERIFY-ENV] Hitting health check endpoint: ${healthCheckUrl}`);

  try {
    const response = await fetch(healthCheckUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    if (data.status !== 'ok') {
      throw new Error(`Server returned unhealthy status body: ${JSON.stringify(data)}`);
    }

    console.log('[VERIFY-ENV] ✅ Backend health check succeeded:', data);
  } catch (error) {
    console.error('[VERIFY-ENV] ❌ ERROR: Backend health check failed!', error.message);
    process.exit(1);
  }

  console.log('[VERIFY-ENV] 🎉 All environment check phases passed successfully! Continuing EAS build...\n');
}

runVerification();
