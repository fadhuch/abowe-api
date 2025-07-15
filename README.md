# Abowe API

REST API for Abowe landing page waitlist management.

## Features

- Add emails to waitlist
- Check if email exists
- Get waitlist statistics
- MongoDB Atlas integration
- CORS configured for production and development

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your MongoDB Atlas connection string
```

3. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:5001`

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/waitlist` - Get all waitlist entries (with pagination)
- `POST /api/waitlist` - Add email to waitlist
- `POST /api/waitlist/check` - Check if email exists
- `GET /api/waitlist/stats` - Get waitlist statistics

### GET /api/waitlist Query Parameters

- `page` (optional) - Page number for pagination (default: 1)
- `limit` (optional) - Number of entries per page (default: 50, max: 100)
- `sortBy` (optional) - Field to sort by (default: 'createdAt')
- `sortOrder` (optional) - Sort order 'asc' or 'desc' (default: 'desc')

**Example:** `GET /api/waitlist?page=1&limit=25&sortBy=email&sortOrder=asc`

## Vercel Deployment

This project is configured for Vercel deployment with serverless functions.

### Environment Variables

Set these in your Vercel dashboard:
- `MONGODB_URI` - Your MongoDB Atlas connection string
- `NODE_ENV` - Set to `production`

### Deploy

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

## Project Structure

```
├── api/
│   └── index.js          # Vercel serverless function entry point
├── server.js             # Local development server
├── package.json
├── vercel.json           # Vercel configuration
└── .env.example          # Environment variables template
```

## Development vs Production

- **Local Development**: Uses `server.js` with Express server
- **Production (Vercel)**: Uses `api/index.js` as serverless function

Both files contain the same API logic but with different initialization patterns optimized for their respective environments.
