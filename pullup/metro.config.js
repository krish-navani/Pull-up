// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const OTP_BACKEND =
  process.env.EXPO_PUBLIC_OTP_BACKEND_URL || 'https://pullup-backend-otp.vercel.app';

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Disable unstable_enablePackageExports to avoid Firebase Auth component registration issues
config.resolver.unstable_enablePackageExports = false;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'utils/reactNativeMapsMock.tsx'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Proxy OTP API through Metro on web dev to avoid CORS blocking the Vercel backend
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url && req.url.startsWith('/api/otp')) {
        const targetUrl = `${OTP_BACKEND}${req.url}`;
        const chunks = [];

        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          fetch(targetUrl, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })
            .then(async (response) => {
              const text = await response.text();
              res.writeHead(response.status, { 'Content-Type': 'application/json' });
              res.end(text);
            })
            .catch((err) => {
              console.error('[OTP PROXY] Error:', err.message);
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'OTP proxy error: ' + err.message }));
            });
        });
        return;
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
