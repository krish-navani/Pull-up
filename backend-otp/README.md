# PullUp OTP Backend

**Production-ready OTP (One-Time Password) authentication backend service** for the PullUp mobile app, deployed on Vercel as serverless functions.

## ✨ Features

✅ **OTP Generation & Verification** - Secure 4-digit OTP codes (configurable length)  
✅ **Email Delivery** - Gmail/Office365/SMTP integration with beautifully formatted HTML emails  
✅ **Firestore Storage** - Persistent OTP records with Firebase (includes expiry, retry limits, verification tracking)  
✅ **Rate Limiting** - 5 OTP requests per 15 minutes per email (configurable)  
✅ **Security** - Input validation, attempt limits, automatic expiry, no code storage in responses  
✅ **Production Ready** - TypeScript source, proper error handling, structured logging, Vercel optimized  
✅ **Serverless Architecture** - Auto-scaling, zero cold start optimization, minimal operational overhead  
✅ **Health Monitoring** - Built-in health check endpoint for monitoring/alerting  

## 📋 Quick Start (Development)

### 1. Install Dependencies

```bash
cd backend-otp/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your Firebase and email credentials
```

### 3. Run Locally

```bash
npm run dev     # Development with auto-reload
npm run build   # TypeScript compilation to dist/
npm start       # Production mode
```

API available at `http://localhost:3000`

## 🌐 API Documentation

### 1. Health Check

**GET** `/api/otp`

Returns service status, configuration, and available endpoints.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-04-14T04:34:27.187Z",
  "nodeEnv": "production",
  "region": "us-east-1",
  "service": "OTP Verification API",
  "version": "1.0.0",
  "endpoints": {
    "health": "GET /api/otp",
    "sendOtp": "POST /api/otp/send-otp",
    "verifyOtp": "POST /api/otp/verify-otp"
  },
  "config": {
    "otpLength": 4,
    "otpExpiryMinutes": 10,
    "universityDomain": "@atlasskilltech.university"
  }
}
```

### 2. Send OTP

**POST** `/api/otp/send-otp`

Generates a new OTP and sends it via email. Each email has a rate limit (default: 5 requests per 15 minutes).

**Request:**
```json
{
  "email": "student@example.com"
}
```

**Notes:**
- Email can be either full email or username only (domain auto-appended)
- Existing OTP for this email is invalidated
- New OTP is generated and sent via email

**Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP sent to your email. Check your inbox and spam folder."
}
```

**Error Responses:**

| Code | Status | Reason | Solution |
|------|--------|--------|----------|
| `INVALID_EMAIL` | 400 | Email not provided | Include `email` field in request |
| `INVALID_EMAIL_FORMAT` | 400 | Invalid email format | Use valid email format (user@domain.com) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Check `retryAfter` field, wait before retrying |
| `OTP_GENERATION_FAILED` | 500 | Backend error | Check service logs |

**Example Error Response:**
```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many OTP requests. Please try again later.",
  "retryAfter": 120
}
```

### 3. Verify OTP

**POST** `/api/otp/verify-otp`

Verifies an OTP code for an email address.

**Request:**
```json
{
  "email": "student@example.com",
  "otp": "1234"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now proceed to the next step."
}
```

**Checks Performed:**
1. ✅ Email and OTP format validation
2. ✅ OTP exists in Firestore
3. ✅ OTP hasn't expired (default: 10 minutes)
4. ✅ OTP hasn't been used already
5. ✅ Maximum attempts not exceeded (default: 5)

**Error Responses:**

| Code | Status | Reason | Solution |
|------|--------|--------|----------|
| `INVALID_EMAIL` | 400 | Email not provided | Include `email` field |
| `INVALID_OTP` | 400 | OTP not provided | Include `otp` field |
| `INVALID_EMAIL_FORMAT` | 400 | Invalid email format | Use valid email format |
| `INVALID_OTP_FORMAT` | 400 | OTP wrong length | Check OTP length (default: 4 digits) |
| `OTP_NOT_FOUND` | 400 | OTP not found | Request a new OTP via send-otp |
| `OTP_EXPIRED` | 400 | OTP expired | Request a new OTP via send-otp |
| `INVALID_OTP` | 400 | Wrong OTP code | Check the code and try again |
| `MAX_ATTEMPTS_EXCEEDED` | 429 | Too many attempts | Request a new OTP via send-otp |
| `TOO_MANY_ATTEMPTS` | 429 | Rate limit on verification | Wait before retrying |

## 🔧 Environment Configuration

See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) for complete environment variable documentation.

**Essential Variables for Production:**

```bash
# Firebase (required - from Firebase Console)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com

# Email Service (required)
MAIL_SERVICE=gmail                    # or office365, sendgrid, etc.
MAIL_USER=your-email@gmail.com        # Sender email
MAIL_PASSWORD=your-app-password       # Gmail: use App Password, not account password

# Optional - reasonable defaults provided
OTP_LENGTH=4                          # Digits in OTP
OTP_EXPIRY_MINUTES=10                 # OTP validity duration
MAX_OTP_ATTEMPTS=5                    # Max verification attempts
RATE_LIMIT_WINDOW_MS=900000           # 15 minutes
RATE_LIMIT_MAX_REQUESTS=5             # Per window per email
UNIVERSITY_DOMAIN=@atlasskilltech.university
```

## 📂 Project Structure

```
backend-otp/
├── api/                               # Vercel serverless functions
│   ├── rateLimit.js                  # In-memory rate limiter
│   ├── utils.js                      # Validation, JSON parsing
│   └── otp/
│       ├── index.js                  # GET /api/otp (health)
│       ├── send-otp.js               # POST send OTP
│       └── verify-otp.js             # POST verify OTP
│
├── backend/                           # TypeScript Express source
│   ├── src/
│   │   ├── server.ts                 # Express app setup
│   │   ├── routes.ts                 # Backend routes (reference)
│   │   ├── config.ts                 # Config from env vars
│   │   ├── middleware.ts             # Validation functions
│   │   ├── firebase.ts               # Firestore initialization
│   │   ├── emailService.ts           # Email/Nodemailer setup
│   │   └── otpService.ts             # OTP generation & verification
│   ├── dist/                         # Compiled JavaScript (generated)
│   ├── package.json                  # Dependencies
│   ├── tsconfig.json                 # TypeScript config
│   ├── .env.example                  # Template for env vars
│   └── Dockerfile                    # For container deployment
│
├── vercel.json                        # Vercel build & function config
├── README.md                          # This file
├── VERCEL_ENV_SETUP.md               # Environment setup guide
└── DEPLOYMENT.md                     # Deployment instructions
```

## 🔐 Security Considerations

### OTP Security
- ✅ OTP codes are **generated server-side** (not predictable)
- ✅ OTP codes are **never returned in responses** (sent only via email)
- ✅ OTP codes are **automatically expired** (10 minutes default)
- ✅ Maximum **verification attempts limited** (5 attempts default, then locked out)
- ✅ Previous OTP codes are **invalidated** when new request made

### Input Validation
- ✅ Email format validation (regex check)
- ✅ OTP format validation (digits only, correct length)
- ✅ Request size limits (1MB payload limit)
- ✅ JSON parsing with error handling

### Rate Limiting
- ✅ Per-email rate limiting on send-otp (prevents brute force OTP requests)
- ✅ Per-email rate limiting on verify-otp (prevents brute force verification)
- ✅ Configurable limits with retry information in response
- ✅ In-memory store with automatic cleanup (serverless-safe)

### Secrets Management
- ✅ All secrets in environment variables (never hardcoded)
- ✅ Firebase private key properly escaped
- ✅ Email passwords stored securely
- ✅ Sensitive data never logged (OTP codes not in logs)

### Deployment Security
- ✅ HTTPS only (Vercel default)
- ✅ Minimal function memory/timeout (reduces attack surface)
- ✅ CORS configured appropriately
- ✅ Error messages don't leak sensitive information

## 📊 Testing

### Test All Endpoints

```bash
# 1. Health check
curl https://pullup-backend-otp.vercel.app/api/otp

# 2. Send OTP
curl -X POST https://pullup-backend-otp.vercel.app/api/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com"}'

# 3. Verify OTP (check email, use actual OTP code)
curl -X POST https://pullup-backend-otp.vercel.app/api/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","otp":"1234"}'
```

### Local Testing

```bash
# Start server
npm run dev

# In another terminal, test endpoints
curl http://localhost:3000/api/otp

curl -X POST http://localhost:3000/api/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 🚀 Deployment

### Deploy to Vercel

1. **Add Environment Variables** - See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)
2. **Connect Repository** - Link GitHub repo to Vercel project
3. **Deploy** - Push to main branch or manually trigger in Vercel dashboard

Vercel automatically:
- Builds the backend with `npm run build`
- Deploys serverless functions from `/api` directory
- Provides HTTPS URL and auto-scaling

### Monitor Deployment

```bash
# Check Vercel logs
vercel logs https://pullup-backend-otp.vercel.app

# Test health endpoint
curl https://pullup-backend-otp.vercel.app/api/otp
```

## 📋 Monitoring & Alerting

### Health Endpoint for Monitoring

```bash
# Poll every 5 minutes
curl https://pullup-backend-otp.vercel.app/api/otp

# Alert if status != "ok" or timeout > 2s
```

### Useful Metrics to Track

- Response times per endpoint
- Rate limit hit frequency
- OTP send success rate (vs email failures)
- Verification success rate
- Error response distribution

### Viewing Logs

**Vercel Dashboard:**
- Project → Deployments → Select deployment → Logs tab
- Shows function execution logs in real-time

**Local Testing:**
- Run `npm run dev` and check console output

## 🐛 Troubleshooting

### "Firebase config is incomplete"
- All three Firebase variables required: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
- Verify in Vercel dashboard that all three are set
- Test locally with `.env.local` file first

### "Email send failed"
- For Gmail: Use App Password (not account password) - See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)
- Verify `MAIL_USER` and `MAIL_PASSWORD` are correct
- Check email account isn't locked (security notice from provider)

### "Invalid JSON in request body"
- Ensure request body is valid JSON
- Include `Content-Type: application/json` header
- Check syntax of JSON payload

### Vercel Build Fails
- Check Vercel dashboard → Deployments → select failed deployment → see error
- Ensure `backend/package.json` has all dependencies
- Run `npm run build` locally to debug

## 🤝 Contributing

Before making changes:
1. Test locally with `npm run dev`
2. Run builds with `npm run build`
3. Test all endpoints before pushing
4. Update documentation if adding features

## 📜 License

Part of PullUp application project.

## 📤 Deployment

### Vercel Deployment

```bash
# Using Vercel CLI
cd backend
vercel deploy --prod

# Or push to GitHub and auto-deploy
git push origin main
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 🔐 Security

- ✅ ES modules (no CommonJS exports)
- ✅ Type-safe TypeScript
- ✅ Environment variable validation
- ✅ Rate limiting on OTP endpoints
- ✅ Firebase authentication  
- ✅ HTTPS on Vercel
- ✅ Secure email credentials

## 🛠️ Development

```bash
# Start dev server with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start
```

## 📊 Monitoring

Check Vercel Dashboard for:
- Build logs
- Runtime errors
- Function performance
- Deployment history

## 🐛 Troubleshooting

**"exports is not defined" error**
- Run: `npm run build` (regenerates ES modules)
- Verify `dist/server.js` uses `import` statements

**Email not sending**
- Check Gmail credentials and app password
- Verify `MAIL_USER` and `MAIL_PASSWORD` in .env
- Gmail may require 2FA + app-specific password

**Firebase connection issues**
- Verify credentials in Firebase console
- Ensure Firestore database exists
- Check network/firewall rules

## 📞 Support

For issues, check:
1. [DEPLOYMENT.md](DEPLOYMENT.md)
2. Console logs: `vercel logs`
3. Firebase console
4. Email service logs


### Backend to Vercel
Push to Vercel-connected GitHub repository or use Vercel CLI:
```bash
vercel deploy
```

## Project Structure

- `functions/` - Firebase Cloud Functions for email sending
- `backend/` - Express.js OTP authentication server
- `api/` - Vercel API routes

## Services

### OTP Service
- Generate 4-digit OTP
- Send via email using EmailJS
- Verify OTP with expiry check
- Max attempt limiting

### Email Service
- Nodemailer integration
- HTML email templates
- Retry logic

### Firebase Integration
- Firestore collections for OTP and users
- Security rules for data protection
- Anonymous authentication

## Environment Variables

Create `.env` in respective folders:

**functions/.env**
```
FIREBASE_PROJECT_ID=pullup-2026
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

**backend/.env**
```
DATABASE_URL=...
EMAILJS_SERVICE_ID=...
EMAILJS_TEMPLATE_ID=...
EMAILJS_PUBLIC_KEY=...
```

## Testing

Test email sending and OTP verification in development environment.

## Security

- Passwords not stored (OTP-based auth)
- User email validation (@atlasskilltech.university only)
- OTP expiry: 10 minutes
- Max attempts: 5 per OTP
- Firestore security rules enforced
