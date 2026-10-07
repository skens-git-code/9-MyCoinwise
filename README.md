# MyCoinwise – Smart Financial Tracker

A full-stack, responsive personal finance tracking and budgeting web application.

---

## 📋 Requirements

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **22.x** (`.nvmrc` pins `22.20.0`) | Node 20 and earlier are unsupported. CI uses Node 22. |
| **npm** | >= 10 | Ships with Node 22. |
| **MongoDB** | 6.x or later, or a MongoDB Atlas URI | The API refuses to start without a reachable database. |

`engines` is declared in the root, `backend/`, and `frontend/` `package.json` files,
and `.nvmrc` files are provided at the root and in both packages, so `nvm use` picks
the right runtime.

> ⚠️ **Do not use non-LTS Node releases** (e.g. 23, 25). The frontend uses Vite 8,
> whose bundler ships per-platform native binaries; on unsupported releases those
> prebuilds can fail to resolve with `Cannot find native binding`.

---

## ⚡ Quick Start (One Command)

```bash
npm run install:all   # install backend + frontend dependencies
npm start             # launch both servers and open the browser
```

On macOS/Linux you can also run `./start.sh`, which wraps the same launcher.

`npm start` launches the backend and the Vite dev server, waits until **both** are
actually serving, and only then prints the "is live" banner and opens the browser.
If either service fails to start, it prints which one failed, why (with common
causes), stops both children, and **exits with code 1** so scripts can detect it.

### What this does:
1. Pre-flight checks ports 5001 and 5173 and aborts early if either is already taken.
2. Starts the Express backend on `http://localhost:5001`.
3. Connects to MongoDB and verifies the backend health check (`/api/health`).
4. Starts the Vite frontend on `http://localhost:5173`.
5. Opens `http://localhost:5173` in your browser.
6. Pressing `Ctrl + C` cleanly stops both servers.

### Launcher environment overrides

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5001` | Backend port. |
| `FRONTEND_PORT` | `5173` | Vite dev port. |
| `STARTUP_TIMEOUT` | `60000` | Milliseconds to wait for readiness before reporting failure. |

```bash
# Example: run on alternate ports when the defaults are taken
PORT=6001 FRONTEND_PORT=6173 npm start
```

---

## 🔐 Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill it in. `.env` is gitignored
and must never be committed.

**Required** — the server exits with a clear message if either is missing:

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string. |
| `JWT_SECRET` | Secret for signing JWTs (generate with `openssl rand -base64 32`). |

**Commonly used:**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5001` | HTTP port. |
| `NODE_ENV` | `development` | One of `development`, `test`, `production`. |
| `CLIENT_URL` / `FRONTEND_URL` | – | Extra allowed CORS origins (comma-separated or individual). |
| `GEMINI_API_KEY` | *(empty)* | Enables AI insights/chat. **Requires a real key**; leave blank to keep AI routes disabled. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id. |
| `SENTRY_DSN` | *(empty)* | When set, Sentry is initialised and exceptions are captured (with password/token scrubbing). |
| `SMTP_*`, `EMAIL_FROM` | – | Required for password reset and verification emails. |
| `FINNHUB_API_KEY` | *(empty)* | Market data for wealth tracking. |
| `FEATURE_TAX_MODULE` | `false` | Enables the Tax Center. |

Frontend variables live in `frontend/.env` (see `frontend/.env.example`):
`VITE_API_URL` (e.g. `http://localhost:5001/api`) and optional `VITE_SENTRY_DSN`.

---

## 🧪 Testing

```bash
npm test                       # backend suite, then frontend (vitest)
npm --prefix backend test      # backend only
npm --prefix frontend test     # frontend only
```

The backend suite runs `backend/scripts/run-tests.js`, which syntax-checks every
backend `.js` file and then executes each unit suite in its own process. It uses
only Node built-ins, so it behaves identically on Windows, macOS, and Linux.

> **Node version drift:** the backend test command previously used a Unix-only
> `find … | xargs` pipeline, which failed on Windows with
> `'xargs' is not recognized`. This went unnoticed because CI runs on
> `ubuntu-latest`. The script above removes that portability trap.

### PWA icons

`frontend/public/icon-{192,512}.png` and `icon-maskable-512.png` are provided
for full PWA standards. The `maskable` icon keeps the glyph inside the inner 80% safe zone so Android's
adaptive icon mask cannot clip it. Do not hand-edit the PNGs, and do not rename a
JPEG to `.png` — browsers trust the manifest's declared MIME type, so a
mislabeled file silently breaks the install icon.

### Other verification helpers

```bash
node backend/scripts/verify-all-pipelines.js   # end-to-end pipeline verification (needs a running API + MongoDB)
```

---

## 🏗️ Architecture & Modules

- **Authentication & Security**: Multi-factor session tokens, bcrypt password hashing, rate limiting, and cascade data protection.
- **Transactions & Statements**: Multi-currency ledger with CSV bank statement parsing, categorization, and balance reconciliation.
- **Budgeting & Savings Goals**: Real-time spending limits, surplus tracking, and visual progress tracking.
- **Wealth & Net Worth**: Multi-asset tracking, liabilities, and debt-to-asset ratio analytics.
- **Cashflow Forecasting & AI Insights**: Configurable projection curves (30–365 days), safety floors, and AI recommendations.
- **Tax Center**: Multi-jurisdiction (US/India) progressive tax estimators, capital gains, advance tax schedules, and checklist.
- **Cross-Device UI**: Responsive glassmorphism interface supporting Desktop (1440px+), Tablet (768px), and Mobile (375px) with adaptive drawers and bottom dock navigation.

---

## 🌐 Supported Browsers

| Platform | Support |
|---|---|
| iOS Safari | Latest and previous major release |
| Android Chrome | Latest and previous major release |
| Desktop Chrome / Edge / Firefox / Safari | Latest |
| Samsung Internet | Best effort |
| In-app browsers (Instagram, Facebook) | **Not verified** — these often block storage or OAuth. Use a standalone browser to sign in. |

---

## ⚠️ Known Limitations

- **Rate limiting is in-memory.** Limits are per backend instance; a multi-instance
  deployment needs a shared store (e.g. Redis) for them to be meaningful.
- **MongoDB is required at boot.** The server fails fast rather than serving
  reduced functionality; `/api/health` reports `DEGRADED` with HTTP 503 only while
  a connection is lost after a successful start.
- **AI features need `GEMINI_API_KEY`.** Without it, `/api/ai` will not return useful results.
- **Email features need SMTP credentials.** Without them, password reset cannot deliver mail.
- **The Tax Center is disabled by default** in production (`FEATURE_TAX_MODULE=false`)
  pending review.

---

## 🤝 Contributing

### Keep the client contract in sync

`frontend/src/services/api.js` is the **source of truth** for request and response
shapes. When you change a route's payload or a model field:

1. Update the client in `frontend/src/services/api.js` first.
2. Make the backend route agree with it.
3. If you must diverge, document why in the pull request.

Never widen a Mongoose enum or add a field to satisfy one side while leaving the
other stale — reconcile both, and note that existing documents must remain valid.

### Profile switching requires the target's password

`POST /api/users/:id/switch` issues a full session token for another account, so it
requires that account's password whenever the target is a **different** user.
Switching back to your own profile (the "Revert" flow) needs no password. Do not
remove this check: household members all share a `household_id`, so without it any
member could obtain the household owner's session.

### House rules

- No secrets in client bundles; never commit `.env`.
- Add authentication **and ownership** checks to every `:id` route (guard against IDOR).
- Validate and bound every query parameter (`limit`, `page`, sort fields).
- Keep diffs minimal and reviewable; do not reformat unrelated code.
- Prefer the shared `utils/logger` over `console.log` in backend code.

---

## 🔄 Production Deployment & Rollback Procedure

### Production Deployment
- **Frontend**: Automated CI/CD on Vercel (`https://9-budget-tracker.vercel.app`) triggered by pushes to `main`.
- **Backend**: Automated Docker/Node deployment on Render (`https://nine-budgettracker.onrender.com`) triggered by pushes to `main`.

### Emergency Rollback Instructions
If a production deployment encounters critical regressions or failures, execute the following rollback steps:

#### 1. Instant Vercel Frontend Rollback (Fastest - < 30 seconds)
```bash
# Roll back to the previous deployment instantly via Vercel CLI:
npx vercel rollback
```
*Or via GUI:* Go to [Vercel Dashboard](https://vercel.com) > `9-budget-tracker` > **Deployments** > locate the previous green deployment > select **Instant Rollback**.

#### 2. Render Backend Rollback
- In [Render Dashboard](https://dashboard.render.com) > `nine-budgettracker` > **Deploys** > select the previous healthy deploy > click **Rollback to this deploy**.

#### 3. Git Repository Rollback
To create a clean revert commit on `main` and trigger an automated redeploy of the previous stable state:
```bash
# Option A: Revert the release commit cleanly
git revert -m 1 HEAD -n
git commit -m "chore(rollback): revert deployment to previous stable release"
git push origin main

# Option B: Emergency hard-reset to previous stable tag (e.g. fix-ui-loaders-complete)
git checkout main
git reset --hard fix-ui-loaders-complete
git push origin main --force
```
