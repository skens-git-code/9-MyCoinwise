# MyCoinwise — Production Deployment & Operations Guide

## 1. Architecture Overview

MyCoinwise is a production-hardened personal finance platform composed of:
- **Frontend**: React 19 + Vite SPA with chunk splitting, framer-motion lazy animations, and virtualized lists.
- **Backend**: Express 5 + Node.js API with Mongoose, rate-limiting tiers, brute-force lockout, Winston structured logging, and Sentry monitoring.
- **Database**: MongoDB Atlas with compound indexes for cursor-based pagination and idempotent seed scripts.

---

## 2. Environment Variables & Secrets

### Backend Configuration (`backend/.env`)
Copy `backend/.env.example` to `backend/.env` on your deployment server or container:

```bash
# Core Server Configuration
PORT=5001
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/MyCoinwise?retryWrites=true&w=majority
JWT_SECRET=<generate-via-openssl-rand-base64-32>

# Allowed CORS Origins
CLIENT_URL=https://mycoinwise.app
FRONTEND_URL=https://mycoinwise.app

# Optional Integrations
GEMINI_API_KEY=<your-google-gemini-key>
GEMINI_MODEL=gemini-2.5-flash
SENTRY_DSN=https://<public-key>@o0.ingest.sentry.io/<project-id>

# Email Delivery (SMTP for password reset & email verification)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
EMAIL_FROM="MyCoinwise <noreply@mycoinwise.app>"
RESET_TOKEN_EXPIRY_MINUTES=60
```

> **Security Requirement**:
> Generate cryptographic secrets using:
> ```bash
> openssl rand -base64 32
> ```

---

## 3. Security Advisory: Git History Sanitization & Secret Rotation

Because a previous commit (`0e1b0f1906b45fdde23301b093c3da5c58767f53`) contained a temporary `.env` file before it was deleted, perform the following two mandatory steps before public repository launch:

### Step 3.1: Rotate Credentials
1. **MongoDB Atlas**: Navigate to **Database Access** in MongoDB Atlas, rotate the database user password, and update the connection string in your production environment.
2. **JWT Secret**: Set a new, random 256-bit `JWT_SECRET` in your production environment. This will safely invalidate any prior tokens.

### Step 3.2: Purge `.env` from Git History
Run `git-filter-repo` (recommended by Git) to wipe `backend/.env` across all past commits:

```bash
# Install git-filter-repo (macOS: brew install git-filter-repo)
brew install git-filter-repo

# Run filter to remove backend/.env from commit history
git filter-repo --invert-paths --path backend/.env --force

# Force push the cleaned history to your remote repository
git push origin --force --all
git push origin --force --tags
```

---

## 4. Production Build & Deployment

### Option A: Static Frontend (Vercel / Cloudflare Pages) + Container Backend (Render / Railway)

1. **Frontend Deployment**:
   - Framework preset: **Vite**
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variables:
     - `VITE_API_URL`: `https://api.mycoinwise.app`

2. **Backend Deployment**:
   - Environment: **Node.js**
   - Root Directory: `backend`
   - Build Command: `npm install --omit=dev`
   - Start Command: `node server.js`
   - Health Check Path: `/api/health`

### Option B: Single Host / VPS (Docker / PM2 + Nginx)

1. **Build frontend**:
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. **Serve backend via PM2**:
   ```bash
   cd ../backend
   npm ci --omit=dev
   pm2 start server.js --name "mycoinwise-api" -i max
   pm2 save
   ```

---

## 5. Health Check & Monitoring

- **API Health Endpoint**: `GET /api/health`
  - Returns `200 OK` with `{ status: "OK", database: "connected", timestamp: "..." }`
  - Returns `503 Service Unavailable` if MongoDB disconnects.
- **Sentry Integration**: Automatically logs unhandled exceptions and Web Vitals (LCP, INP, CLS, TTFB).

---

## 6. Rollback Runbook

If a critical defect is identified post-release, follow this rollback procedure:

1. **Identify the Last Known Healthy Tag / Commit**:
   ```bash
   git log --oneline -n 10
   ```
2. **Rollback Backend**:
   - In Render/Railway/ECS: Select the previous deployment version and click **Redeploy / Rollback**.
   - If deploying via Git:
     ```bash
     git revert HEAD --no-edit
     git push origin main
     ```
3. **Rollback Frontend**:
   - In Vercel / Cloudflare Pages: Open the Deployments tab, locate the prior stable deployment, and click **Promote to Production** (instant zero-downtime rollback).
4. **Database Rollback Note**:
   - Schema additions are non-breaking and backward-compatible.
   - If rolling back across a migration, restore the point-in-time backup from MongoDB Atlas snapshot.
