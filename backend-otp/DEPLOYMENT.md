# Deployment Guide

## Architecture

- **Backend**: Express.js server running on Vercel
- **Database**: Firestore for OTP storage
- **Email**: Gmail/Nodemailer for OTP delivery
- **API Route**: Vercel API route handler in `/api`

## Prerequisites

- Firebase project with Firestore enabled
- Gmail account with app password
- Vercel account linked

## Environment Setup

1. Create `.env.local` in `backend/` directory:

```bash
cd backend
cp .env.example .env.local
```

2. Fill in the required environment variables

## Local Development

```bash
cd backend
npm install
npm run dev
```

Server runs on http://localhost:3000

## Building

```bash
cd backend
npm run build
```

## Deployment to Vercel

### Option 1: Using Vercel CLI

```bash
vercel deploy --prod
```

### Option 2: Git Integration

- Connect repository to Vercel dashboard
- Merges to main branch auto-deploy

## Environment Variables on Vercel

Set these in Vercel project settings:

- `NODE_ENV`: `production`
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_PRIVATE_KEY`: Your Firebase service account private key (replace `\n` with actual newlines)
- `FIREBASE_CLIENT_EMAIL`: Your Firebase service account email
- `MAIL_USER`: Gmail address
- `MAIL_PASSWORD`: Gmail app password
- Other OTP/Rate limit configs

## Docker Deployment (Optional)

```bash
docker build -t pullup-backend .
docker run -p 3000:3000 --env-file .env.production.local pullup-backend
```

## Health Check

```bash
curl https://your-vercel-domain.vercel.app/api/otp/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-14T...",
  "nodeEnv": "production"
}
```

## API Endpoints

### Send OTP
- **POST** `/api/otp/send-otp`
- **Body**: `{ "email": "user@university.edu" }`

### Verify OTP
- **POST** `/api/otp/verify-otp`
- **Body**: `{ "email": "user@university.edu", "otp": "1234" }`

### Health Check
- **GET** `/api/otp/health`

## Troubleshooting

### "exports is not defined" Error
- Ensure TypeScript builds to ES modules
- Check `package.json` has `"type": "module"`
- Run `npm run build` to regenerate dist folder

### Email Not Sending
- Verify Gmail credentials and app password
- Check MAIL_SERVICE is "gmail"
- Gmail may require 2FA + app-specific password

### Firebase Connection Issues
- Validate Firebase service account credentials
- Ensure Firestore is initialized in Firebase console
- Check network/firewall rules

## Monitoring

Check Vercel dashboard for:
- Build logs
- Runtime errors
- Performance metrics
- Function invocations
