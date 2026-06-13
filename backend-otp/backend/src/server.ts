import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { config, validateConfig } from './config.js';
import { verifyMailerConfig } from './emailService.js';
import { initializeFirebase } from './firebase.js';
import routes from './routes.js';

const app = express();

// Run initialization ONCE
let initialized = false;

const init = async () => {
  if (initialized) return;

  console.log('[INIT] Starting server initialization...');

  try {
    validateConfig();
    console.log('[INIT] Config validated');
  } catch (err: any) {
    console.error('[INIT] Config validation failed:', err.message);
    throw err;
  }

  try {
    initializeFirebase();
    console.log('[INIT] Firebase initialized');
  } catch (err: any) {
    console.error('[INIT] Firebase initialization failed:', err.message);
    throw err;
  }

  try {
    await verifyMailerConfig();
    console.log('[INIT] Email config verified');
  } catch (err) {
    console.warn('[INIT] Email config issue:', (err as Error).message);
  }

  initialized = true;
  console.log('[INIT] Server initialization complete');
};

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request timeout
app.use((req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

app.use(
  cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: config.corsOrigin !== '*',
  })
);

// Security headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `[HTTP] ${req.method} ${req.path} ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

// Routes
app.use('/api/otp', routes);

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
});

// Error handler (IMPORTANT: after routes)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message:
      config.nodeEnv === 'production'
        ? 'Internal server error'
        : err.message,
  });
});

// Vercel handler
export default async function handler(req: Request, res: Response) {
  try {
    await init();
    app(req, res);
  } catch (error) {
    console.error('[CRITICAL] Handler initialization failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        code: 'INITIALIZATION_ERROR',
        message: config.nodeEnv === 'production' ? 'Service unavailable' : (error instanceof Error ? error.message : 'Unknown error'),
      });
    }
  }
}

// Start server locally (outside Vercel environment)
if (!process.env.VERCEL) {
  init().then(() => {
    const port = config.port || 3000;
    app.listen(port, () => {
      console.log(`[SERVER] 🚀 Local server listening on http://localhost:${port}`);
    });
  }).catch((err) => {
    console.error('[SERVER] ❌ Failed to initialize local server:', err);
  });
}