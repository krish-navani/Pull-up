# PullUp Admin Dashboard

Web-based admin dashboard for managing driver licenses and application approvals.

## Setup

To run the admin server locally:

```bash
node admin-server.js
```

The dashboard will be available at `http://localhost:8000`

## Features

- View all driver license submissions
- Filter licenses by verification status (pending, verified, rejected)
- View license details and driver information
- Approve/reject license submissions
- Download license images for review

## Files

- `admin-licenses.html` - Complete HTML/CSS/JavaScript admin dashboard
- `admin-server.js` - Node.js HTTP server to serve the dashboard

## Deployment

### Vercel Option 1: Static Hosting
Upload `admin-licenses.html` to Vercel as a static file.

### Option 2: Node.js Server
Deploy `admin-server.js` to a Node.js hosting platform (AWS Lambda, Heroku, DigitalOcean, etc.)

### Option 3: Cloud Functions
Convert to Google Cloud Functions or AWS Lambda for serverless deployment.

## Security Considerations

⚠️ **Important**: 
- This admin dashboard should be protected with authentication
- Only administrators should have access
- Add proper authentication layer before production deployment
- Use HTTPS in production
- Add rate limiting and CORS security headers

## Firebase Integration

The dashboard reads from Firebase Firestore:
- Collection: `users` with `licenseVerificationStatus` field
- Queries: Filter by verification status
- Updates: Modify license status back to Firestore

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Responsive design for tablet/desktop

## Future Enhancements

- User authentication and authorization
- Email notifications for approvals
- Audit logging of admin actions
- Dashboard analytics
- Bulk operations
- Admin role management
