# Vercel Environment Variables Setup Guide

This document explains how to configure environment variables for the OTP backend API on Vercel.

## Required Environment Variables

### 1. Firebase Configuration

**FIREBASE_PROJECT_ID**
- **Description:** Your Firebase project ID
- **Example:** `pullup-backend-123456`
- **Source:** Firebase Console → Project Settings → Project ID
- **Required:** ✅ Yes

**FIREBASE_PRIVATE_KEY**
- **Description:** Firebase private key for service account authentication
- **Source:** Firebase Console → Project Settings → Service Accounts → Generate New Private Key
- **Format:** Raw JSON private key (Vercel will handle escaping)
- **⚠️ Important:** Paste the ENTIRE private key content as-is. Do NOT manually escape newlines.
- **Required:** ✅ Yes

**FIREBASE_CLIENT_EMAIL**
- **Description:** Firebase service account email
- **Example:** `firebase-adminsdk-xxxx@pullup-backend-123456.iam.gserviceaccount.com`
- **Source:** Same file as FIREBASE_PRIVATE_KEY (client_email field)
- **Required:** ✅ Yes

### 2. Email Service Configuration

**MAIL_SERVICE**
- **Description:** Email provider service name
- **Options:** `gmail`, `office365`, `sendgrid`, `mailgun`, etc.
- **Default:** `gmail`
- **Required:** No (defaults to gmail)

**MAIL_USER**
- **Description:** Email address to send OTP from
- **Example:** `noreply@example.com` or your Gmail address
- **Required:** ✅ Yes

**MAIL_PASSWORD**
- **Description:** Email provider password or app-specific password
- **⚠️ Important for Gmail:** 
  - Enable 2FA in your Google Account
  - Generate an App Password: https://myaccount.google.com/apppasswords
  - Use the 16-character app password (without spaces)
- **⚠️ Important for Office365:** Use the actual account password or an app password
- **Required:** ✅ Yes

**MAIL_FROM_NAME**
- **Description:** Display name for email sender
- **Default:** `PullUp`
- **Example:** `PullUp Support`
- **Required:** No

### 3. OTP Configuration

**OTP_LENGTH**
- **Description:** Number of digits in generated OTP code
- **Default:** `4`
- **Options:** `4`, `5`, `6`, etc.
- **Required:** No

**OTP_EXPIRY_MINUTES**
- **Description:** How long OTP remains valid (in minutes)
- **Default:** `10`
- **Example:** `5` for 5 minutes, `15` for 15 minutes
- **Required:** No

**MAX_OTP_ATTEMPTS**
- **Description:** Maximum verification attempts before lockout
- **Default:** `5`
- **Required:** No

### 4. Rate Limiting Configuration

**RATE_LIMIT_WINDOW_MS**
- **Description:** Time window for rate limiting (milliseconds)
- **Default:** `900000` (15 minutes)
- **Common Values:**
  - `300000` = 5 minutes
  - `600000` = 10 minutes
  - `900000` = 15 minutes
- **Required:** No

**RATE_LIMIT_MAX_REQUESTS**
- **Description:** Maximum requests allowed per window per email
- **Default:** `5`
- **Example:** Allows 5 OTP requests per 15 minutes per email
- **Required:** No

### 5. Application Configuration

**UNIVERSITY_DOMAIN**
- **Description:** Default domain appended to usernames without @ symbol
- **Default:** `@atlasskilltech.university`
- **Example:** `@myuniversity.edu`
- **Required:** No

## Setup Instructions

### Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click ⚙️ (Settings) → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Save the JSON file locally (keep it secure!)

### Step 2: Get Email Credentials

#### For Gmail:
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification if not already enabled
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select "Mail" and "Windows Computer"
5. Copy the 16-character password

#### For Office 365:
1. Use your organization's email address and password
2. If using multi-factor auth, generate an app password

#### For Other Providers:
Refer to your email provider's documentation for SMTP credentials or app passwords

### Step 3: Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (pullup-backend-otp)
3. Go to Settings → Environment Variables
4. Click "Add New"
5. Enter each variable from the sections above

**Example for FIREBASE_PRIVATE_KEY:**
```
{
  "type": "service_account",
  "project_id": "pullup-backend-123456",
  "private_key_id": "xxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxx@pullup-backend-123456.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxx%40pullup-backend-123456.iam.gserviceaccount.com"
}
```

### Step 4: Trigger Deployment

After adding environment variables:
1. Push your code to GitHub
2. Vercel will automatically rebuild and deploy
3. Or manually trigger a deployment in Vercel dashboard

## Testing

### Test Health Check
```bash
curl https://your-vercel-url.vercel.app/api/otp
```

### Test Send OTP
```bash
curl -X POST https://your-vercel-url.vercel.app/api/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### Test Verify OTP
```bash
curl -X POST https://your-vercel-url.vercel.app/api/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","otp":"1234"}'
```

## Troubleshooting

### "Firebase config is incomplete"
- Check that all three Firebase variables are set
- Verify no extra spaces or line breaks in FIREBASE_PRIVATE_KEY
- Test in local environment first with .env file

### "Invalid JSON in request body"
- Ensure JSON in request is valid
- Check Content-Type header is application/json

### "Email send failed"
- Verify MAIL_USER and MAIL_PASSWORD are correct
- For Gmail: ensure App Password is used (not account password)
- Check email account hasn't been locked for security reasons
- For Office365: verify multi-factor auth settings

### "Too many OTP requests"
- User has exceeded rate limit
- Default: 5 requests per 15 minutes per email
- Retry after the resetTime timestamp

### Vercel Build Fails
- Check Vercel logs in dashboard
- Ensure backend/package.json has all dependencies
- Verify tsconfig.json is in backend/ directory
- Run `npm run build` locally to test

## Security Best Practices

1. ✅ Never commit .env.local to git
2. ✅ Use Vercel Environment Variables for secrets (not in code)
3. ✅ Rotate Firebase private keys periodically
4. ✅ Use app-specific passwords for email (not account passwords)
5. ✅ Keep OTP expiry time reasonable (5-15 minutes)
6. ✅ Monitor rate limits to prevent abuse
7. ✅ Use HTTPS only (Vercel provides this by default)

## Production Checklist

- [ ] All required environment variables set in Vercel
- [ ] Firebase project is accessible and running
- [ ] Email service credentials are valid
- [ ] Health check endpoint returns 200 OK
- [ ] Send OTP endpoint sends emails successfully
- [ ] Verify OTP endpoint validates correctly
- [ ] Rate limiting is working as expected
- [ ] Error responses are descriptive but don't leak sensitive data
- [ ] Logs are being written to Vercel dashboard
- [ ] Monitoring/alerts are configured
