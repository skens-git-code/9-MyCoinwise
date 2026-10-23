# 🪙 MyCoinwise — Smart Personal Finance & Budgeting Tracker

### *Full-Stack Personal Wealth Platform · AI-Powered Financial Intelligence*

<div align="center">

  ![Version](https://img.shields.io/badge/version-1.0.4-007AFF?style=for-the-badge&logo=semanticrelease&logoColor=white)
  ![Backend](https://img.shields.io/badge/backend-Express%205-000000?style=for-the-badge&logo=express&logoColor=white)
  ![Frontend](https://img.shields.io/badge/frontend-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)
  ![Database](https://img.shields.io/badge/database-MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
  ![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
  ![PWA](https://img.shields.io/badge/PWA-ready-blueviolet?style=for-the-badge)
  ![License](https://img.shields.io/badge/license-ISC-success?style=for-the-badge)
  ![Lines](https://img.shields.io/badge/code-40K%2B%20lines-ff69b4?style=for-the-badge)

  <img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=700&size=30&duration=2500&pause=1000&color=007AFF&center=true&vCenter=true&width=800&height=70&lines=Track+Wealth.+Master+Budgets.;AI-Powered+Financial+Coach;Secure.+Fast.+Observable.;Build+Wealth+With+Intelligence+%F0%9F%9A%80" alt="Typing SVG" />

  <br>

  <p><strong>📍 Newton School of Technology, Delhi · 📧 sarthakmathapati4@gmail.com · 📱 +91 93567 07688</strong></p>

  <br>

  <a href="#-overview"><img src="https://img.shields.io/badge/📋-Overview-007AFF?style=for-the-badge" /></a>
  <a href="#️-technical-architecture"><img src="https://img.shields.io/badge/🏗️-Architecture-4ECDC4?style=for-the-badge" /></a>
  <a href="#-feature-showcase"><img src="https://img.shields.io/badge/✨-Features-FFD166?style=for-the-badge" /></a>
  <a href="#-full-api-reference"><img src="https://img.shields.io/badge/🔌-API-06D6A0?style=for-the-badge" /></a>
  <a href="#-installation"><img src="https://img.shields.io/badge/⚡-Installation-EF476F?style=for-the-badge" /></a>

</div>

---

## 📋 **Overview**

Welcome to **MyCoinwise** — a production-grade, full-stack **personal finance and budgeting platform** that transcends the traditional spreadsheet. It is a **monorepo-style application** with two deployable units: a hardened **Node.js/Express backend** backed by **MongoDB**, and a modern **React 19 / Vite 8** frontend that runs both as a web app and as a **Progressive Web App (PWA)**.

The application's mission is simple: help individuals and households **manage their personal wealth with confidence**. Track income and expenses, maintain multiple financial accounts, set savings goals, enforce budgets, manage recurring subscriptions, record calendar events, compute net worth over time, estimate taxes for **India and the United States**, export data to **Excel / CSV / PDF**, and chat with an **AI financial coach** powered by **Google Gemini**.

This is not a demo. The codebase is **production-oriented** from the ground up — it includes JWT authentication with refresh/revocation, per-endpoint rate limiting, NoSQL-injection sanitization, CORS allowlisting, Helmet security headers, structured **Winston** logging, **Sentry** error tracking (server + client), **audit logging**, graceful shutdown, database migrations, currency conversion, recurring-transaction processing, **optimistic concurrency**, and a full test suite spanning backend unit/integration and frontend Vitest + Playwright E2E.

The project is deployed with the **backend on Render.com** and the **frontend on Vercel**, and is authored by **Sarthak Mathapati**.

> *"Every rupee tracked is a decision informed. Every budget kept is a future secured. Every insight acted upon is a life improved."* — **Sarthak Mathapati**

### 🎯 **Core Philosophy**

| Principle | Implementation |
|:---------|:---------------|
| **Disciplina** | Clean, modular architecture with versioned migrations and separation of concerns |
| **Execucao** | Production-grade security, observability, and graceful degradation from day one |
| **Foco** | User-centric design — the app serves the person, not the other way around |

### 🧩 **What Makes It Different**

- **Defensive security first** — JWT sessions with server-side revocation, NoSQL sanitization (including the Express 5 `req.query` fix), audit logs, and credential-scrubbing Sentry tunnels.
- **Graceful degradation** — Missing Gemini key → offline fallbacks; missing SMTP → console logs; missing live FX → 4-layer static fallback; missing DB → fail-fast exit.
- **Observability baked in** — Request IDs on every response, Morgan HTTP logging, Winston structured logs, Sentry server + client, Web Vitals.
- **Resilience** — MongoDB exponential backoff (max 5 attempts), cursor pagination, atomic upserts for recurring transactions, epsilon-based float comparisons, optimistic concurrency on tax profiles.
- **PWA-ready** — Service worker with cache-first static assets, stale-while-revalidate navigation, push notification support, and full manifest.
- **Internationalization** — 5 languages: English, Hindi, Marathi, Haryanvi, Kannada.
- **Tax-aware** — First-class tax module for India (new/old regimes) and US (federal), with capital gains, deductions, credits, payments, documents, and reports.

---

## 🏛️ **Technical Architecture**

MyCoinwise follows a classic **client–server REST architecture** with a **monorepo layout** under a single repository root. The backend is a stateless Express 5 API; the frontend is an independent React SPA that consumes the API via **Axios + TanStack React Query**.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MYCOINWISE • ARCHITECTURE                         │
│                    Version 1.0.4 · 2025-2026                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                LAYER 1 — PRESENTATION (React 19)             │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │   │
│   │   │  22 Pages     │  │ 20+ Components│  │  Split Context│    │   │
│   │   └───────────────┘  └───────────────┘  └───────────────┘    │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │   │
│   │   │ TanStack Query│  │   Axios Client │  │ PWA + SW      │   │   │
│   │   └───────────────┘  └────────────────┘  └───────────────┘   │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │   │
│   │   │ i18n (5 langs)│  │  PDF Export    │  │ AI Engine     │   │   │
│   │   └───────────────┘  └────────────────┘  └───────────────┘   │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                              ▲   │                                   │
│                              │   ▼   REST /api/* (JSON)              │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │              LAYER 2 — API SERVER (Express 5)                │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │   │
│   │   │ 22 Routers    │  │ 4 Middleware  │  │ Rate Limiter  │    │   │
│   │   └───────────────┘  └───────────────┘  └───────────────┘    │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │   │
│   │   │ Auth (JWT)    │  │ NoSQL Sanitize │  │ Sentry Tunnel │   │   │
│   │   └───────────────┘  └────────────────┘  └───────────────┘   │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                              ▲   │                                   │
│                              │   ▼   Mongoose ODM                    │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                  LAYER 3 — DATA (MongoDB)                    │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │   │
│   │   │  21 Models    │  │  Indexes      │  │  Migrations   │    │   │
│   │   └───────────────┘  └───────────────┘  └───────────────┘    │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │   │
│   │   │Connection Pool│  │  TTL Indexes   │  │  Meta Version │   │   │
│   │   │ min 5 / max 50│  │  (LoginLogs)   │  │  v1 → v3      │   │   │
│   │   └───────────────┘  └────────────────┘  └───────────────┘   │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │               LAYER 4 — EXTERNAL INTEGRATIONS                │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │   │
│   │   │ Google Gemini │  │ exchangerate  │  │SMTP / Nodemailer │ │   │
│   │   └───────────────┘  └───────────────┘  └──────────────────┘ │   │
│   │                                                              │   │
│   │   ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │   │
│   │   │  Sentry Cloud │  │  Finnhub (opt) │  │  MongoDB Atlas│   │   │
│   │   └───────────────┘  └────────────────┘  └───────────────┘   │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Architectural Principles

1. **Separation of Concerns** — The backend exposes a stateless REST API; the frontend is an independent SPA consuming it via Axios + TanStack React Query.
2. **Defensive Security** — JWT authentication, session revocation via `session_version`, per-endpoint rate limiting, NoSQL sanitization, Helmet headers, CORS allowlist, Sentry credential redaction.
3. **Graceful Degradation** — AI features (Gemini) are optional; missing API keys yield offline fallbacks rather than crashes. Market data uses dev mocks and static fallback FX rates. SMTP email falls back to console logging in dev.
4. **Observability** — Winston structured logging, audit log file (`backend/audit.log`), Sentry error tracking (server + client), Morgan HTTP logging with request IDs.
5. **Resilience** — MongoDB connection with exponential backoff, bounded retry, graceful shutdown on SIGTERM/SIGINT, currency/number validation, epsilon float comparisons, cursor pagination for large datasets.

---

## 🗂️ **Project Identity & Metadata**

| Field | Value |
|-------|-------|
| **Project Name** | MyCoinwise |
| **Full Name** | MyCoinwise – Smart Personal Finance & Budgeting Tracker |
| **Version** | 1.0.4 |
| **Author** | Sarthak Mathapati |
| **License** | ISC |
| **Repository** | `https://github.com/skens-git-code/9-MyCoinwise.git` |
| **Branch** | `main` (latest commit `6194027`) |
| **Platform** | macOS (darwin), Node.js ≥ 22, npm ≥ 10 |
| **Backend Runtime** | Express 5 + Mongoose 8 on Node.js |
| **Frontend Runtime** | React 19 + Vite 8 |
| **Database** | MongoDB |
| **AI Provider** | Google Gemini (`gemini-2.5-flash`) |
| **Deployment Targets** | Render (backend API), Vercel (frontend SPA/PWA) |
| **Locale Support** | English (en), Hindi (hi), Marathi (mr), Haryanvi (bgc), Kannada (kn) |
| **Supported Currencies** | USD, INR, EUR, GBP, JPY, CAD, AUD, SGD, AED, CHF, CNY, MXN, BRL, KRW, THB |

The root `package.json` declares:

```json
{
  "scripts": {
    "start": "node start.js",
    "dev": "node start.js",
    "build": "npm --prefix frontend run build",
    "test": "node backend/scripts/run-tests.js && npm --prefix frontend test",
    "install:all": "npm --prefix backend install && npm --prefix frontend install",
    "db:reset": "node backend/scripts/reset-db.js"
  }
}
```

`start.js` is a **single-command launcher** that boots the backend, spins up the Vite dev server, waits for readiness on both, and opens the browser.

---

## ✨ **Feature Showcase**

### 💰 **Personal Finance Excellence**

| Feature | Description | Complexity |
|:--------|:------------|:-----------|
| **Multi-Account Tracking** | Bank, wallet, credit card, investment, cash, other | Intermediate |
| **Transaction Management** | Income/expense, splits, recurring, bank CSV import | Advanced |
| **Budget Envelopes** | Monthly/weekly/custom, rollover, warning thresholds | Advanced |
| **Savings Goals** | Auto-save, priority, deadline, completion gating | Intermediate |
| **Subscription Tracking** | Cycle detection, next billing date, trial tracking | Intermediate |
| **Calendar Events** | Bills, income, reminders, payments, meetings | Intermediate |
| **Net-Worth Tracking** | Wealth items with depreciation, live prices, monthly snapshots | Advanced |
| **Currency Conversion** | 14 currencies, 4-layer FX fallback | Intermediate |
| **Statement Import** | CSV parsing, classification, dedup fingerprints | Advanced |

### 🤖 **AI & Intelligence**

| Feature | Technology | Innovation |
|:--------|:-----------|:-----------|
| **AI Financial Coach** | Google Gemini 2.5 Flash | Chat with financial context (transactions + goals) |
| **AI Cashflow Insights** | Gemini + aggregated metrics | Forecasts and danger-day detection |
| **AI Wealth Analysis** | Gemini + wealth metrics | Portfolio-level advice |
| **Spending Forecast** | Client-side statistics | Weighted average + linear trend |
| **Anomaly Detection** | Per-category sigma | Outlier transaction flagging |
| **Goal Time Prediction** | Savings rate analysis | Predicted completion dates |
| **Alert Generation** | Rule-based + severity | Dashboard notification priorities |

### 🔐 **Security & Privacy**

| Feature | Implementation | Status |
|:--------|:---------------|:-------|
| **JWT Authentication** | HS256, `jti` + `session_version` | ✅ Production |
| **Session Revocation** | Server-side deactivation + version bump | ✅ Production |
| **Brute-Force Protection** | 5 failures → 30-min lockout | ✅ Production |
| **NoSQL Injection** | `express-mongo-sanitize` + Express 5 query fix | ✅ Production |
| **Rate Limiting** | Per-endpoint, per-IP, per-user | ✅ Production |
| **CORS Allowlist** | Env-driven from `FRONTEND_URL`, `CLIENT_URL`, `ALLOWED_ORIGINS` | ✅ Production |
| **Helmet Headers** | X-Content-Type-Options, X-Frame-Options, etc. | ✅ Production |
| **Sentry Credential Redaction** | `beforeSend` recursive scrub | ✅ Production |
| **Tax Document Encryption** | AES-256-GCM at rest | ✅ Production |
| **Audit Logging** | Every sensitive access logged | ✅ Production |
| **Password Policy** | 8+ chars, lower+upper+digit+special | ✅ Production |
| **Token Sanitization** | SHA-256 hashed reset/verify tokens | ✅ Production |

### 📊 **Analytics & Reporting**

| Feature | Description | Export Formats |
|:--------|:------------|:---------------|
| **Dashboard Analytics** | Income/expense deltas, category pie chart, net-worth trend | — |
| **Spending Analytics** | Category trends, monthly comparison | — |
| **Cashflow Forecast** | AI-driven future month projection | — |
| **Tax Reports** | Income, deductions, capital gains, payments | JSON, CSV |
| **Transaction Export** | Full transaction history | XLSX |
| **Full Backup** | Every user data collection | JSON (v5) |
| **PDF Statements** | Executive A4, SHA-256 audit hash | PDF |

### 🌍 **Internationalization**

```
┌───────────────────────────────────────────────────────┐
│                 LANGUAGE SUPPORT MATRIX               │
├───────────────┬───────────────────────┬───────────────┤
│ Language      │ Code                  │ Coverage      │
├───────────────┼───────────────────────┼───────────────┤
│ English       │ en                    │ ✅ 100%       │
├───────────────┼───────────────────────┼───────────────┤
│ Hindi         │ hi                    │ ✅ 100%       │
├───────────────┼───────────────────────┼───────────────┤
│ Marathi       │ mr                    │ ✅ 100%       │
├───────────────┼───────────────────────┼───────────────┤
│ Haryanvi      │ bgc                   │ ✅ 100%       │
├───────────────┼───────────────────────┼───────────────┤
│ Kannada       │ kn                    │ ✅ 100%       │
└───────────────┴───────────────────────┴───────────────┘
```

### 📱 **Responsive Architecture**

| Breakpoint | Device Range | Layout Strategy | Optimizations |
|:-----------|:------------|:----------------|:--------------|
| **Ultra-Small** | ≤ 480px | Single column, bottom nav | Touch targets ≥44px, reduced animations |
| **Mobile** | 481px – 768px | 2 columns, drawer navigation | GPU-friendly shadows |
| **Tablet** | 769px – 1024px | 2 columns, compact nav | Charts reflow |
| **Desktop** | ≥ 1025px | Multi-column, inline nav | Full 3D effects, command palette |

---

## 🧠 **Backend Deep-Dive**

### 7.1 — Entry Point & Boot Sequence (`backend/server.js`)

`server.js` is the Express application entry point. Its boot sequence is deliberately ordered to fail fast on misconfiguration:

1. **Validated environment first** — `config/env.js` is imported before anything else. It loads `.env` from an absolute path (relative to `backend/`) and runs `envalid`'s `cleanEnv()`, guaranteeing every variable is parsed, coerced, defaulted, and validated before any other module reads `process.env`. It exports `config`, `trustProxy`, and `isProduction`.

2. **Sentry initialization** — If `SENTRY_DSN` is configured, `@sentry/node` is initialized with the environment, a 20% trace sample rate, and a `beforeSend` callback that recursively redacts credential-bearing keys (`password`, `currentPassword`, `newPassword`, `token`, `authorization`, `cookie`) from events and headers before they leave the process.

3. **Express app creation** with `trust proxy` set from config (defaults to `false`; safe behind exactly one reverse proxy).

4. **Middleware stack** (registered in order):
   - **Request ID middleware** (first): reads `x-request-id` (sanitized: array→first element, trimmed, regex-filtered, max 64 chars) or generates a UUID via `crypto.randomUUID`. Sets `req.id` and `X-Request-ID` response header so every response carries a correlation ID.
   - **Morgan HTTP logging** with a custom `:id` token, skipping high-frequency health probes in production.
   - **Helmet** security headers.
   - **CORS** with allowlist from `FRONTEND_URL`, `CLIENT_URL`, and `ALLOWED_ORIGINS`.
   - **express-rate-limit** global limiter.
   - **compression** (gzip).
   - **sanitizeRequest** — strips MongoDB operators (`$`-prefixed, dotted keys) from `req.body`, `req.params`, and `req.query`. For Express 5, `req.query` is redefined as an own writable property because `express-mongo-sanitize` mutates in place and the Express 5 getter would discard mutations.
   - **json + urlencoded body parsers** with a 100 KB limit.
   - **Cookie parser** (for token-from-cookie auth).

5. **Route mounting** — All routers are mounted under `/api`:
   - `/api/auth`, `/api/users`, `/api/transactions`, `/api/accounts`, `/api/budgets`, `/api/goals`, `/api/wealth`, `/api/cashflow`, `/api/events`, `/api/subscriptions`, `/api/calculations`, `/api/currency`, `/api/security`, `/api/tax`, `/api/export`, `/api/ai`, `/api/telemetry`

   Auth is applied selectively: `currency` and `telemetry` routes are intentionally public (first-party, tracker-safe design); everything else requires JWT.

6. **404 handler** and **centralized error handler** (returns JSON `{ error }` with appropriate status; in production, stack traces are suppressed).

7. **Database connection** — `connectToMongo()` is called with bounded exponential-backoff retries (up to 5 attempts). If MongoDB is unreachable, the process exits with code 1 (fail fast).

8. **Migrations** — `runMigrations()` executes pending versioned migrations (schema version tracked in a `meta` collection).

9. **HTTP server listen** — Binds to `PORT` (default 5001), with `EADDRINUSE` / `EACCES` handling and actionable error messages.

10. **Graceful shutdown** — Handles `SIGTERM`, `SIGINT`, `unhandledRejection`, and `uncaughtException`. Closes the HTTP server (dropping idle keep-alive sockets via `closeAllConnections()` on Node ≥ 18), closes MongoDB, and exits within a 10-second force timeout.

### 7.2 — Configuration & Environment Validation (`backend/config/env.js`)

This module is the **single source of truth** for backend configuration. It uses `envalid`'s `cleanEnv()` with a full schema:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | str (choices) | `development` | `development` \| `test` \| `production` |
| `PORT` | port | `5001` | HTTP listen port |
| `MONGO_URI` | str | *required* | MongoDB connection string |
| `JWT_SECRET` | str | *required* | JWT signing secret |
| `GEMINI_API_KEY` | str | `''` | Google Gemini API key (blank disables AI) |
| `GEMINI_MODEL` | str | `gemini-2.5-flash` | Gemini model ID |
| `SENTRY_DSN` | str | `''` | Sentry DSN (blank disables error reporting) |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | various | `''` / `587` / `false` | SMTP for outbound email |
| `EMAIL_FROM` | str | `MyCoinwise <noreply@mycoinwise.app>` | Outbound sender |
| `RESET_TOKEN_EXPIRY_MINUTES` | num | `60` | Password-reset token lifetime |
| `FINNHUB_API_KEY` | str | `''` | Finnhub market data key |
| `FRONTEND_URL` | str | `http://localhost:5173` | Primary frontend origin (CORS) |
| `CLIENT_URL` / `ALLOWED_ORIGINS` | str | `''` | Additional CORS origins |
| `FEATURE_TAX_MODULE` | bool | `true` | Tax Center feature flag |
| `TAX_FIELD_ENCRYPTION_KEY` | str | `''` | 32-byte key for tax document encryption at rest |
| `TAX_ADMIN_TOKEN` | str | `''` | Token for protected tax rule seed endpoint |
| `MAX_EXPORT_ROWS` | num | `50_000` | Cap on export rows |
| `MAX_BACKUP_DOCS` | num | `100_000` | Max docs per collection in backup |
| `ENABLE_DIAGNOSTIC_ECHO` | bool | `false` | `/api/__diagnostic` echo route (test tooling) |
| `TRUST_PROXY` | str | `false` | Express trust proxy value |

`TRUST_PROXY` is parsed by `parseTrustProxy()` into a hop count, boolean, or named subnet. It auto-detects Render (`RENDER=true`) and Vercel (`VERCEL=1`).

### 7.3 — Database Layer (`backend/db.js`)

Uses Mongoose with `strictQuery: true` for MongoDB 8.2 driver compatibility. `connectToMongo()` connects with:
- `serverSelectionTimeoutMS: 8000`
- `heartbeatFrequencyMS: 10000`
- `maxPoolSize: 50`, `minPoolSize: 5`
- `retryWrites: true`, `w: 'majority'`

It retries with exponential backoff (capped at 8 seconds) up to 5 attempts. Connection-state listeners (`disconnected`, `reconnected`, `error`) log via the shared Winston logger. Exports `mongoose` and `connectToMongo`.

### 7.4 — Middleware Stack

#### `middleware/auth.js` — JWT Authentication

Validates Bearer tokens from `Authorization: Bearer <token>` header or `token` cookie. Verifies with `jsonwebtoken` using HS256 only (algorithm whitelist). Loads the user and session via a single `$lookup` aggregation when the token has a `jti` claim. Checks:

- Session is active (`is_active: true`)
- `session_version` in token ≤ user's `session_version` (bumping `session_version` on password change/logout revokes all tokens)
- Repairs missing `household_id` on root accounts (fire-and-forget)

Attaches `req.userId` (string) and `req.user` (spread of token claims **first**, then server-derived `id`, `household_id`, `session_id` so server values always win — a critical security fix preventing claim shadowing).

#### `middleware/admin.js` — Tax Admin Gate

Compares `x-admin-token` header against `TAX_ADMIN_TOKEN`. Returns 503 if unconfigured, 403 on mismatch.

#### `middleware/ownership.js` — Ownership Authorization

Factory `checkOwnership(idParamName, options)` that verifies a target resource belongs to the authenticated user:

- With `options.model`: queries the model by `_id` + `ownerField` (default `user_id`) = requester ID; 404 if not found.
- With `options.household`: verifies the target user's `household_id` matches the requester's household (household-root access control).
- Default: direct `String(targetId) === String(requesterId)` comparison; 403 on mismatch.

Uses `isValidObjectId` from `schemaStandardizer` (strict 24-hex regex, rejects IDs starting with `!`, `@`, etc.).

#### `middleware/sanitizeRequest.js` — NoSQL Injection Sanitization

Uses `express-mongo-sanitize` on `req.body` and `req.params`, and redefines `req.query` as a sanitized copy (Express 5 getter fix). Exports `sanitizeRequest`, `sanitizeQuery` (testable standalone), and `HttpError` (status-carrying error class).

### 7.5 — Route Inventory

All routes are mounted under `/api`. Below is the complete inventory:

#### `/api/auth` (`routes/auth.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create account + issue JWT. Tighter rate limiter. |
| POST | `/login` | Authenticate + issue JWT with `jti` + `session_version`. Records `LoginLog`. |
| GET | `/me` | Current user + synced balance. |
| POST | `/logout` | Invalidate current session (bump `session_version`, deactivate Session). |
| POST | `/change-password` | Change password + invalidate all other sessions. |
| GET | `/login-logs` | Paginated login history. |
| POST | `/forgot-password` | Generate reset token (SHA-256 hash stored), send email. |
| POST | `/reset-password` | Reset password using valid token; prevent reuse; bump `session_version`. |

#### `/api/users` (`routes/users.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List household users. |
| GET | `/me` | Current user. |
| GET | `/:id` | Single user (ownership guard). |
| POST | `/` | Create household user (rate-limited, temp password). |
| PATCH/PUT | `/:id/settings` | Settings update. |
| GET/PUT | `/:id/notifications` | Notification preferences. |
| GET/PUT | `/:id/advanced-preferences` | Advanced preferences. |
| POST | `/:id/reset` | Reset financial data. |
| DELETE | `/:id` | Delete user + all data. |
| POST | `/:id/switch` | Switch to linked household profile. |
| POST | `/:userId/import` | Restore JSON backup (versions 1–5). |

#### `/api/transactions` (`routes/transactions.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/statement/preview` | Parse + classify bank CSV (comma or semicolon, 5 MB, 1000 rows). |
| POST | `/statement/import` | Import selected rows with `import_fingerprint` dedup. |
| GET | `/:userId` | List with **cursor pagination** (base64 `{date, _id}`). |
| POST | `/process-recurring` | Force-process recurring. |
| POST | `/` | Create transaction. |
| PUT | `/:id` | Update. |
| DELETE | `/:id` | Hard delete. |
| POST | `/bulk-delete` | Hard delete many. |

Fixes: epsilon-based decimal validation, atomic upsert keyed on `recurrence_instance_key` (race-safe), parallel balance sync with ObjectId validation, defensive `audit_logs` initialization, `String()`-based ownership comparisons, Cache-Control on responses.

#### `/api/accounts` (`routes/accounts.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List accounts. |
| POST | `/` | Create (unique case-insensitive name per user). |
| PUT | `/:id` | Update (currency change blocked if linked transactions exist). |
| DELETE | `/:id` | Delete only when no linked transactions. |

Allowed types: `bank`, `wallet`, `credit_card`, `investment`, `cash`, `other`. Icons: `Wallet`, `CreditCard`, `Landmark`, `Coins`. Max balance ±999,999,999.99.

#### `/api/budgets` (`routes/budgets.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List with progress + rollover (single transaction load, avoids N+1). |
| POST | `/` | Create (overlap check inside try/catch). |
| PUT | `/:id` | Update (recomputes rollover against fresh data). |
| DELETE | `/:id` | Delete. |

Budget types: `monthly`, `weekly`, `custom`. Warning thresholds 1–10 values between 1–500. Rollover only when enabled. Templates: `student`, `family`, `travel`, `freelancer`.

#### `/api/goals` (`routes/goals.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List goals. |
| GET | `/single/:id` | Single goal. |
| POST | `/` | Create goal. |
| PUT | `/:id` | Update (completion gated on saved ≥ target). |
| DELETE | `/:id` | Delete. |

Categories: emergency_fund, savings, vacation, gadget, investment, vehicle, home, education, debt, purchase, other. Intervals: daily, weekly, monthly. Priorities: low, medium, high, critical.

#### `/api/wealth` (`routes/wealth.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/items` | Hydrated wealth items (live prices + depreciation). |
| POST | `/items` | Create item. |
| PUT | `/items/:id` | Update item. |
| DELETE | `/items/:id` | Delete item. |
| GET | `/history` | Net-worth history (last 24 snapshots). |
| POST | `/ai-insights` | Gemini AI coach (rate-limited 20/15min, cached 5 min). |
| GET | `/ai-status` | Gemini connectivity health check. |

Asset classes: `liquid_asset`, `illiquid_asset`, `business_equity`, `retirement`, `liability`. API key sent via `x-goog-api-key` header (not query string) to avoid log leakage.

#### `/api/cashflow` (`routes/cashflow.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai-insights` | Gemini cashflow analysis (15s timeout, fallback at HTTP 200). |

#### `/api/events` (`routes/events.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List calendar events sorted by date. |
| POST | `/` | Create event. |
| PUT | `/:id` | Update event. |
| DELETE | `/:id` | Delete event. |

Types: `bill`, `income`, `expense`, `reminder`, `payment`, `meeting`, `other`, `general`.

#### `/api/subscriptions` (`routes/subscriptions.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List subscriptions with filters. |
| GET | `/single/:id` | Single subscription. |
| POST | `/` | Create (duplicate-name check, URL protocol http/https only). |
| PUT | `/:id` | Update. |
| DELETE | `/:id` | Delete. |

Cycles: daily, weekly, monthly, quarterly, yearly. Payment methods: `card`, `bank_transfer`, `wallet`, `upi`, `other`.

#### `/api/calculations` (`routes/calculations.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | List recent calculations (newest first, capped). |
| POST | `/` | Save/update (upsert on `user_id` + `client_id`). |
| DELETE | `/:userId` | Clear all calculations. |
| DELETE | `/:userId/:clientId` | Delete single calculation. |

#### `/api/currency` (`routes/currency.js`) — **public**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rates?base=USD` | Exchange rates. Cache → upstream → stale → static fallback. Never throws for supported bases. |

#### `/api/security` (`routes/security.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/change-password` | Full policy (8+, lower+upper+digit+special), revoke all sessions. |
| POST | `/change-email` | Case-insensitive uniqueness check, revoke all sessions. |
| GET | `/sessions` | List active sessions (flags current via `jti`). |
| DELETE | `/sessions/:sessionId` | Revoke specific session. |
| DELETE | `/sessions` | Revoke all except current. |

Rate-limited (20/15min general, 5/15min sensitive). Cache-Control: no-store.

#### `/api/tax` (`routes/tax.js`) — gated by `FEATURE_TAX_MODULE`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/profiles` | Tax profile CRUD. |
| PUT/DELETE | `/profiles/:id` | Update/delete profile. |
| POST | `/estimate` | Annual tax estimate. |
| POST | `/estimate/compare` | India new vs old regime. |
| POST | `/estimate/capital-gains` | Capital gains estimate. |
| GET/POST | `/tag` | Tax tags. |
| DELETE | `/tag/:id` | Remove tag. |
| GET/POST | `/payments` | Tax payments. |
| DELETE | `/payments/:id` | Delete payment. |
| GET/POST | `/documents` | Tax documents. |
| DELETE | `/documents/:id` | Delete document. |
| GET | `/report/:profileId?format=` | Tax report (json/csv/pdf). |
| POST | `/admin/seed-rules` | Seed tax rules (admin, idempotent). |

Jurisdictions: `IN`, `US`. Optimistic concurrency via `_version`. Tax document `file_url` encrypted at rest (AES-256-GCM). Per-user rate limiters. Audit logs every data access.

#### `/api/export` (`routes/export.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:userId` | Excel export (capped at `MAX_EXPORT_ROWS`, overflow reported in Summary sheet). |
| GET | `/backup/:userId` | Full JSON backup (version 5). Filenames use local date. |

#### `/api/ai` (`routes/ai.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | Gemini chat with financial context. Rate-limited 20/15min. History capped 20 turns. 20s timeout. Missing key → 503. |

#### `/api/telemetry` (`routes/telemetry.js`) — **public**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sentry-tunnel` | Forward browser Sentry envelopes to project ingest. Anti-relay DSN check. Body ≤100KB. Disabled (503) without `SENTRY_DSN`. |

### 7.6 — Data Models (Complete Inventory)

All models use the `standardizeSchema` plugin which:

1. Strips non-hex client-supplied `_id` in a pre-validate hook (replaces with fresh ObjectId).
2. Adds a virtual `id` getter returning the 24-character hex string.
3. Standardizes `toJSON`/`toObject` transforms: exposes `id`, strips `__v`, `password`, `reset_password_token`, `email_verify_token`.

| Model | Collection | Key Fields | Indexes |
|-------|-----------|-----------|---------|
| **User** | `users` | username, last_name, profession, household_id (self-ref), email (unique), password (select:false), phone, date_of_birth, balance, monthly_goal, currency, theme (light/amoled/auto), language (en/hi/mr/bgc/kn), is_email_verified, account_locked, locked_until, failed_login_count, session_version, last_login, last_login_ip, reset tokens, fcm_token, push_notifications, email_notifications | email (unique), household_id, username, email_verify_token (sparse), reset_password_token (sparse) |
| **Transaction** | `transactions` | user_id, type (income/expense), category, amount, date, note, account_id, transaction_number, currency, payment_method, location, tags, merchant, import_fingerprint, receipt_url, is_recurring, recurrence_interval, parent_transaction_id, recurrence_instance_key, is_deleted (legacy), audit_logs, splits | user_id+date, user_id+is_deleted, user_id+date+_id (cursor), user_id+type, user_id+category, user_id+account_id+is_deleted, user_id+import_fingerprint (sparse), tags, user_id+recurrence_instance_key (partial unique) |
| **Account** | `accounts` | user_id, name, type, currency, initial_balance, current_balance, is_active, color, icon | user_id+name (unique CI collation), user_id+is_active+created_at |
| **Budget** | `budgets` | user_id, name, type, period_start, period_end, total_limit, total_spent, rollover_enabled, rollover_amount, warning_thresholds, template, is_active, auto_renew, category_budgets | user_id+name+period_start (unique CI), user_id+period_start, user_id+is_active+period_start |
| **Goal** | `goals` | user_id, name, target, saved, color, icon, deadline, priority, category, is_completed, completed_at, auto_save_enabled, auto_save_amount, auto_save_interval, is_archived | user_id, priority |
| **Event** | `events` | user_id, title, date, type, amount, description, color | user_id+date |
| **Subscription** | `subscriptions` | user_id, name, amount, cycle, color, icon, url, notes, payment_method, currency, start_date, next_billing_date, trial_ends, is_active, is_paused, cancelled_at | user_id+is_active, user_id+next_billing_date, next_billing_date, user_id+name (unique CI) |
| **WealthItem** | `wealth_items` | user_id, name, asset_class, base_value, quantity, symbol, interest_rate, acquisition_date, current_value_override, sold_at, sale_price, sale_fees, note | user_id, user_id+asset_class |
| **NetWorthHistory** | `net_worth_history` | user_id, snapshot_date, total_assets, total_liabilities, net_worth | user_id+snapshot_date (unique) |
| **Calculation** | `calculations` | user_id, client_id, expression, result, numeric_result, angle_mode | user_id+created_at, user_id+client_id (unique) |
| **LoginLog** | `login_logs` | user_id, email, status, reason, ip, is_suspicious, risk_score, user_agent, device, geo, failure_reason, mfa_used | TTL 90 days on created_at, user_id, email, ip, status |
| **Session** | `sessions` | user_id, token_id (jti, unique, select:false), device, ip, user_agent, last_active, is_active | user_id+is_active+last_active, versionKey: false |
| **TaxProfile** | `tax_profiles` | user_id, household_id (sparse), name, jurisdiction, fiscal_year, filing_status, tax_regime, dependents, currency, pre_tax_contributions[], itemized_deductions[], tax_credits[], capital_loss_carryforward, _version | user_id+fiscal_year, user_id+jurisdiction, household_id (sparse) |
| **TaxRuleSet** | `tax_rule_sets` | rule_key (unique), jurisdiction, fiscal_year, regime, currency, brackets[], standard_deduction, surcharge_thresholds[], cess_rate, rebate, capital_gains, sales_tax_default, advance_tax_schedule[], metadata | jurisdiction+fiscal_year+regime (unique), rule_key (unique) |
| **TaxTag** | `tax_tags` | transaction_id (unique), user_id, tax_profile_id, treatment, portion, tax_amount, note | transaction_id (unique), user_id, user_id+treatment |
| **TaxPayment** | `tax_payments` | user_id, tax_profile_id, amount, currency, payment_date, payment_type, reference, notes | user_id, tax_profile_id, payment_date |
| **TaxDocument** | `tax_documents` | user_id, tax_profile_id, document_type, label, file_url, file_size (max 10MB), mime_type, issue_date, amount, notes | user_id, tax_profile_id, user_id+created_at |

### 7.7 — Service Layer

#### `services/taxEngine.js`

Pure, dependency-free tax calculation module (no DB/HTTP). Exports:

- `calculateIncomeTax({grossIncome, ruleSet, profile})` — Progressive brackets with deductions, credits, rebate, surcharge, cess. US filers take the greater of standard vs itemized (mutually exclusive); other jurisdictions allow stacking.
- `calculateCapitalGains({holdings, ruleSet})` — Short/long-term capital gains tax.
- `calculateSalesTaxSummary({transactions, defaultRate})` — Sales tax grouped by category.
- `calculateDeductions({taggedTransactions, profile})` — Sums tagged + profile deductions.
- `calculateCredits({profile, grossIncome, ruleSet})` — Summarizes tax credits.
- `estimateAnnualTax({profile, ruleSet, transactions, payments, taggedTransactions, holdings})` — Top-level orchestrator.
- `roundMoney(value)` — Two-decimal rounding.

#### `services/marketDataService.js`

Live price fetch with in-memory LRU cache (max 500 symbols, 15-min TTL). Development mode uses `DEV_MOCK_PRICES` fixtures (Nifty 50, Reliance, HDFC, BTC, AAPL, ETH with small random variance). Production returns no prices (empty) rather than inventing values; Finnhub API block is commented out and can be enabled when a key is configured.

#### `services/snapshotEngine.js`

Net-worth snapshot capture. `takeSnapshot(userId)` hydrates wealth items with live prices and depreciation, buckets into assets vs liabilities, and upserts one `NetWorthHistory` record per user per month (pinned to month start). `runGlobalSnapshots()` runs for all active users via `Promise.allSettled` (CRON-friendly).

Depreciation: `baseValue × (1 − rate)^yearsOwned` with default rate 0.15.

#### `services/emailService.js`

Nodemailer SMTP transport (lazy singleton). Dev mode (no SMTP config) logs emails to console instead of sending. Templates: `sendPasswordResetEmail` (1-hour expiry), `sendVerificationEmail` (24-hour expiry).

#### `services/fxRates.js`

Foreign-exchange rate service with 4-layer resolution: fresh in-memory cache (5-min TTL) → live upstream (`api.exchangerate-api.com/v4`) → stale cache → static fallback table (`FALLBACK_TO_INR`). Never throws for supported bases; source is labeled (`cache`/`live`/`stale`/`fallback`).

Static fallback rates (INR per unit): USD 83.5, EUR 90.2, GBP 105.8, JPY 0.56, CAD 61.2, AUD 53.8, SGD 61.5, AED 22.7, CHF 95, CNY 11.5, MXN 4.9, BRL 16.4, KRW 0.063, THB 2.35.

### 7.8 — Utilities

#### `utils/logger.js`

Winston-based dual logger:

- `logger` — general app logging to console; level `info` in production, `debug` otherwise.
- `auditLogger` — security/audit events as JSON lines appended to `backend/audit.log` (path resolved relative to module, not CWD).

#### `utils/transactionIntegrity.js`

- `dedupeTransactions(transactions, {excludeFuture})` — Filters soft-deleted, future-dated (with 24-hour timezone grace), and duplicate rows.
- `isFutureTransaction(value, now)` — Returns true only when date is verifiably after end of grace period; missing/invalid dates return `false`.
- `transactionIntegrityKey(transaction)` — Stable identity: import fingerprint → recurrence instance key → transaction number → created_at → composite manual key.

#### `utils/schemaStandardizer.js`

Mongoose plugin applied to every model. Provides `isValidObjectId` (strict 24-hex), `safeObjectId`, `standardizeSchema`.

### 7.9 — Migrations (`backend/migrations/index.js`)

Versioned migrations tracked in a `meta` collection (`schema_version` key). `LATEST_VERSION = 3`:

- **v1** — Backfill `household_id` on legacy root accounts (aggregation pipeline `$set: {household_id: '$_id'}`).
- **v2** — Repair balances zeroed by the missing-`date` projection bug (recomputes from `repair-balances.js`).
- **v3** — Drop obsolete unique index on `username_1` to allow full name editing; sync indexes.

Each block is idempotent. `runMigrations()` returns `{from, to, applied}`.

### 7.10 — Backend Scripts

| Script | Purpose |
|--------|---------|
| `reset-db.js` | Database reset |
| `run-tests.js` | Backend test runner |
| `seed-and-benchmark.js` | Seed data + benchmark |
| `seed-tax-rules.js` | Seed India 2024 + US Federal 2024 tax rules |
| `audit-e2e-reset-profile.js` | E2E audit profile reset |
| `cleanup-duplicates-and-balances.js` | Dedupe + balance cleanup |
| `measure-auth-*.js` / `measure-stage3-1.js` | Auth performance measurement |
| `soak-auth.js` | Auth soak test |
| `verify-all-pipelines.js` | Pipeline verification |
| `verify-browser-screenshots.mjs` | Browser screenshot verification |

### 7.11 — Backend Tests

| Test | Coverage |
|------|----------|
| `auth-middleware.test.js` | JWT auth middleware |
| `pagination.test.js` | Cursor pagination |
| `request-sanitize.test.js` | NoSQL sanitization (standalone) |
| `security-integration.test.js` | Security integration |
| `taxEngine.test.js` | Tax engine calculations |
| `transaction-timezone.test.js` | Transaction timezone handling |
| `helpers/integrationHarness.js` | Test harness |

---

## 🎨 **Frontend Deep-Dive**

### 8.1 — Entry Point (`frontend/src/main.jsx`)

Renders React 19 in `StrictMode` with:

- `ErrorBoundary` wrapping the app
- `QueryClientProvider` with TanStack React Query client
- Lazy-loaded d3-tilt interactions (only on fine-pointer devices)
- SCSS styles imported (`./styles/main.scss`)

### 8.2 — Root (`frontend/src/App.jsx`)

The main application shell. Uses `react-router-dom` v7 with:

- **Lazy-loaded routes** for all pages (code splitting via `React.lazy` + `Suspense` with route-specific skeletons)
- **Providers**: `I18nextProvider`, `AppStateContext` + `AppActionsContext` (split state/actions), `ToastProvider`, `MotionConfig` (reduced-motion = "user")
- **Route structure**:
  - Public: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/terms`, `/privacy`, `/404`
  - Protected (wrapped in `ProtectedRoute` + `AppLayout`): `/`, `/transactions`, `/analytics`, `/accounts`, `/budgets`, `/goals`, `/subscriptions`, `/cashflow`, `/wealth`, `/settings`, `/calendar`, `/tax`, `/calculator`, `/about`, `/reports`, and a catch-all `/*`

### 8.3 — State Management (`frontend/src/contexts/AppContext.jsx`)

Split context pattern to prevent unnecessary re-renders:

- **`AppStateContext`** — Data slices (user, transactions, accounts, goals, budgets, subscriptions, events, theme, language, currency, alerts, insights, etc.). Components subscribing to data re-render when data changes.
- **`AppActionsContext`** — Stable handler functions (`login`, `logout`, `fetchData`, `addTransaction`, `editTransaction`, `deleteTransaction`, `updateUser`, `switchUser`, `revertSession`, `toggleTheme`, `setLanguage`, `fmt`, `installPWA`, etc.). Components triggering actions do NOT re-render on data updates.
- **`AppContext`** (deprecated) — Legacy combined context, retained only for backward compatibility with test fixtures.

Custom hooks: `useAppState()`, `useAppActions()`, `useAppContext()` (with test-env fallback).

### 8.4 — API Client (`frontend/src/services/api.js`)

Central Axios client with:

- `API_URL` resolved from `VITE_API_URL` env, or `http://localhost:5001/api` on localhost, or `https://nine-budgettracker.onrender.com/api` in production.
- 50-second timeout (tolerates Render cold starts).
- Request interceptor: attaches JWT to non-public routes; token sourced from `?token=` query param (auto-persists to localStorage and strips from URL), then `localStorage.mcw-token`, then `sessionStorage.mcw-token`.
- Response interceptor: on 401, clears auth state and emits `mcw:auth-expired` event.
- Typed methods for every backend route: auth, users, transactions, accounts, budgets, goals, wealth, cashflow, events, subscriptions, calculations, currency, security, tax, export, ai.
- Exports `CURRENCIES` constant.

### 8.5 — Page Inventory (~22 pages)

All pages are lazy-loaded in `App.jsx` with `Suspense` skeletons:

| Page | Purpose |
|------|---------|
| `Dashboard.jsx` | Hero balance card, income/expense stats with MoM deltas, recent transactions (grouped by day), daily spending vs income area chart, net worth over time chart, savings goal progress, category breakdown pie chart, transaction add/edit form |
| `Transactions.jsx` | Transaction list, add/edit form, delete confirmation, statement import |
| `Analytics.jsx` | Spending analytics and forecasts |
| `Accounts.jsx` | Financial account management |
| `Budgets.jsx` | Budget tracking with progress bars and rollover |
| `Goals.jsx` | Savings goals with auto-save |
| `Subscriptions.jsx` | Recurring subscription tracking |
| `Cashflow.jsx` | Cashflow forecasting + AI insights |
| `Wealth.jsx` | Net worth tracker + AI coach |
| `SettingsPage.jsx` | Profile, theme, language, security, data export/backup |
| `Calendar.jsx` | Calendar events (bills, income, reminders) |
| `Tax.jsx` | Tax Center: profiles, estimates, deductions, capital gains, payments, documents, reports (CSV/PDF) |
| `Calculator.jsx` | Calculator with history sync |
| `Login.jsx` / `Register.jsx` | Authentication |
| `ForgotPassword.jsx` / `ResetPassword.jsx` / `VerifyEmail.jsx` | Password reset / email verification |
| `About.jsx` / `Terms.jsx` / `Privacy.jsx` | Static informational pages |
| `Reports.jsx` | Reports |
| `NotFound.jsx` | 404 page |

### 8.6 — Component Inventory

**Core layout/UI:**

- `AppLayout.jsx` — Shell layout (sidebar, header, footer)
- `TransactionForm.jsx` — Add/edit transaction form
- `AIChat.jsx` — AI financial chat interface
- `AlertsCenter.jsx` — Notification center
- `AnimatedNumber.jsx` — Count-up animation for balance cards
- `Breadcrumbs.jsx` — Navigation breadcrumbs
- `CommandPalette.jsx` — Ctrl+K global search palette
- `CookieBanner.jsx` — Cookie consent (gates Microsoft Clarity)
- `CurrencyConverter.jsx` — Currency conversion tool
- `ErrorBoundary.jsx` — React error boundary
- `ErrorState.jsx` — Error display state
- `FixedSizeList.jsx` — Virtualized list wrapper (react-window)
- `Footer.jsx` — Page footer
- `HelpModal.jsx` — Help modal
- `KeyboardShortcutsModal.jsx` — Keyboard shortcuts reference
- `Loader.jsx` — Loading spinner
- `Modal.jsx` — Base modal component
- `OnboardingTour.jsx` — Platform onboarding tour
- `ProtectedRoute.jsx` — Authentication guard
- `ToastProvider.jsx` — Toast notifications

**Tax-specific (`components/tax/`):**

- `TaxBracketChart.jsx` — Tax bracket visualization
- `TaxDisclaimer.jsx` — Tax disclaimer notice
- `TaxEstimateCard.jsx` — Tax estimate display card
- `TaxPaymentForm.jsx` — Tax payment recording form
- `TaxProfileForm.jsx` — Tax profile creation/editing
- `taxProfileDefaults.js` — Default tax profile values

**Skeletons (`components/skeletons/`):**

- `RouteSkeletons.jsx` — Route-level loading skeletons for all pages

### 8.7 — Client-Side Service Layer

| Service | Purpose |
|---------|---------|
| `api.js` | Central Axios client + all typed API methods |
| `aiEngine.js` | Client-side statistical models: `predictNextMonthSpending` (weighted average + linear trend), `detectAnomalies` (per-category sigma outlier detection), `predictTimeToGoal`, `generateAlerts`, `getSpendingInsights` |
| `pdfExport.js` | Executive A4 PDF statement engine using jspdf + jspdf-autotable: SHA-256 audit hash, running balance, integer-cents money math, Latin-numeral locale formatting, zebra rows, continuation page headers/footers, blob download fallback for Safari |
| `i18n.js` | i18next configuration + full translations for en, hi, mr, bgc, kn (~1905 lines) |
| `clarity.js` | Microsoft Clarity integration: strict opt-in, cookie-consent gated, DNT respected, zero PII, double-injection guard, `_clck`/`_clsk` cookie purging on rejection |
| `quantumRuntime.js` | Quantum Glass interaction runtime: IntersectionObserver reveal animations, magnetic links, tilt elements (desktop-only), Ctrl+K command palette, throttle utility, HTML escape |

### 8.8 — Utility Functions

| Utility | Purpose |
|---------|---------|
| `currencyRates.js` | Currency conversion, FX rate fetching/caching |
| `currencyUtils.js` | Currency formatting utilities |
| `dateUtils.js` | Date helpers (`getAppDate`, etc.) |
| `deviceTier.js` | Device tier detection (mobile vs desktop) |
| `d3-tilt.js` | 3D tilt interaction effect |
| `transactionIntegrity.js` | Client-side transaction dedup (mirrors backend) |
| `csvUtils.js` | CSV parsing utilities |

### 8.9 — Styling & Theming (SCSS)

Modular SCSS partials in `frontend/src/styles/`:

- `main.scss` — Main entry importing all partials
- `_variables.scss` — Design tokens (colors, spacing, breakpoints)
- `_mixins.scss` — Reusable mixins
- `_base.scss` — Base/reset styles
- `_layout.scss` — Layout grid and shell
- `_themes.scss` — Theme definitions (light, amoled, auto)
- `_amoled.scss` — AMOLED dark theme
- `_auth.scss` — Auth page styles
- `_components.scss` — Component styles
- `_custom.scss` — Custom overrides
- `_dashboard.scss` — Dashboard-specific styles
- `_depth.scss` — Depth/elevation styles
- `_loader.scss` — Loader styles
- `_mobile-perf.scss` — Mobile performance optimizations
- `_mobile.scss` — Mobile-responsive styles
- `_notifications.scss` — Notification/toast styles
- `_page-enhancements.scss` — Page-level enhancements
- `_plain-ui.scss` — Plain UI fallback
- `_portfolio.scss` — Portfolio/wealth styles
- `_responsive-fixes.scss` — Responsive breakpoint fixes
- `_settings.scss` — Settings page styles
- `_transactions.scss` — Transaction list styles

### 8.10 — Hooks

| Hook | Purpose |
|------|---------|
| `useCountUp.jsx` | Animated number counting |
| `useDelayedLoading.js` | Delayed loading state (avoids flash of loader) |
| `useFocusTrap.js` | Focus trap for modals/accessibility |
| `useMediaQuery.js` | Responsive media query hook |

### 8.11 — PWA, Service Worker, Manifest

- **`public/manifest.json`**: PWA manifest with name "MyCoinwise – Smart Budget Tracker", standalone display, icons (192, 512, maskable 512), shortcuts to Dashboard and Add Transaction.
- **`public/sw.js`**: Service Worker (`mycoinwise-v4` cache). Cache-first for immutable static assets, stale-while-revalidate for navigation, never intercepts API calls or non-GET requests. Supports push notifications for budget alerts.
- **`frontend/vercel.json`**: Vercel deployment config with SPA rewrites (all non-asset routes → `index.html`), security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), and cache headers for static assets.

### 8.12 — Internationalization (i18n)

Supports 5 languages via `i18next` + `react-i18next`:

- **en** — English (🇺🇸)
- **hi** — हिन्दी / Hindi (🇮🇳)
- **mr** — मराठी / Marathi (🇮🇳)
- **bgc** — हरियाणवी / Haryanvi (🇮🇳)
- **kn** — ಕನ್ನಡ / Kannada (🇮🇳)

Translation file (`frontend/src/services/i18n.js`) is ~1905 lines covering all UI strings: authentication, dashboard, transactions, budgets, goals, subscriptions, cashflow, wealth, calendar, settings, tax center, calculator, notifications, security, and more.

### 8.13 — Testing & Quality

**Frontend tests** (`frontend/src/test/`, Vitest + jsdom + Testing Library):

- `setup.js` — Test setup: jest-dom matchers, auto-cleanup, fixed test clock (2026-09-30), matchMedia/ResizeObserver/localStorage/sessionStorage polyfills
- `app-root.test.jsx` — App root rendering
- `auth-rendering.test.jsx` — Auth rendering
- `calendar.test.jsx` — Calendar
- `clarity-consent.test.jsx` — Clarity consent flow
- `countup-motion.test.jsx` — Count-up animation
- `dashboard-hierarchy.test.jsx` — Dashboard hierarchy
- `forgotPassword.test.jsx` — Forgot password
- `goals.test.js` — Goals
- `notifications.test.jsx` — Notifications
- `reports.test.jsx` — Reports
- `route-skeletons.test.jsx` — Route skeletons
- `subscriptions.test.jsx` — Subscriptions
- `transaction-form-reset.test.jsx` — Transaction form reset
- `transaction-ticket.test.jsx` — Transaction ticket
- `utils.test.jsx` — Utilities
- `all-pages-render.test.jsx` — All pages render

**Backend tests** (`backend/test/`): auth middleware, pagination, request sanitize, security integration, tax engine, transaction timezone.

**Tooling**: ESLint (flat config), size-limit budget (1.5 MB for main app + vendors), rollup-plugin-visualizer (bundle analysis), Playwright (E2E).

---

## 🕸️ **Data Model Relationships (Conceptual)**

```
User (1) ──┬──< Transaction (many)      [user_id]
           ├──< Account (many)           [user_id]
           ├──< Budget (many)            [user_id]
           ├──< Goal (many)              [user_id]
           ├──< Event (many)             [user_id]
           ├──< Subscription (many)      [user_id]
           ├──< WealthItem (many)        [user_id]
           ├──< NetWorthHistory (many)   [user_id]
           ├──< Calculation (many)       [user_id]
           ├──< LoginLog (many)          [user_id]
           ├──< Session (many)           [user_id]
           ├──< TaxProfile (many)        [user_id]
           ├──< TaxPayment (many)        [user_id]
           ├──< TaxDocument (many)       [user_id]
           └──< TaxTag (many)            [user_id]

Transaction (1) ──> TaxTag (1)           [transaction_id unique]
TaxProfile (1) ──> TaxTag (many)         [tax_profile_id]
TaxProfile (1) ──> TaxPayment (many)     [tax_profile_id]
TaxProfile (1) ──> TaxDocument (many)    [tax_profile_id]
Account (1) ──> Transaction (many)       [account_id]
User (1) ──> User (many) [household]     [household_id self-ref]
Transaction (1) ──> Transaction (many)   [parent_transaction_id recurring]
```

### Household Model

```
           ┌──────────────────┐
           │  User (root)     │
           │  household_id =  │
           │  own _id         │
           └────────┬─────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Child A │ │ Child B │ │ Child C │
   │ hh = root│ │ hh = root│ │ hh = root│
   └─────────┘ └─────────┘ └─────────┘
```

The household model allows a single root user to manage multiple profiles (family members) with separate financial data but shared account access. Ownership checks verify `household_id` matches before granting access.

---

## 🔒 **Security Architecture**

### Authentication & Session Management

- **JWT (HS256)** with `jti` (JWT ID) and `session_version` claims.
- Tokens issued on login; stored in `localStorage`/`sessionStorage` and sent via `Authorization: Bearer` header or `token` cookie.
- `Session` collection tracks active sessions (`token_id` = `jti`, `is_active` flag).
- `session_version` on `User` is incremented on password change, email change, password reset, and logout — invalidating all previously issued JWTs.
- Auth middleware checks `session_version` in token vs database; rejects if token version is stale.
- Rate limiting: separate limiters for register (tighter) and login; security endpoints limited to 20/15min general, 5/15min for sensitive changes.

### Brute-Force Protection

- `MAX_FAILED_LOGINS = 5`; `LOCK_DURATION_MINUTES = 30`.
- `account_locked` + `locked_until` on User; `isLocked()` method.
- `LoginLog` records successes/failures with reason codes, IP, user agent, risk score, and suspicious flags.

### Input Validation & Injection Prevention

- `express-validator` on all mutating endpoints (field-level validation/sanitization).
- `express-mongo-sanitize` via `sanitizeRequest` middleware blocks `$`-prefixed and dotted keys (NoSQL injection). The Express 5 `req.query` getter issue is fixed by redefining `req.query` as an own property.
- `schemaStandardizer` plugin strips non-hex client-supplied `_id` values.
- All monetary values parsed with explicit validation (rejects booleans, arrays, NaN, Infinity); epsilon-based float comparison instead of raw `Math.round(amount * 100)`.

### Transport & Headers

- `helmet` for security headers (CSP-adjacent, X-Content-Type-Options, etc.).
- `cors` with allowlist from `FRONTEND_URL`, `CLIENT_URL`, `ALLOWED_ORIGINS`.
- `trust proxy` defaults to `false` (prevents X-Forwarded-For spoofing); set to `1` behind exactly one reverse proxy.
- Request ID on every response for traceability.
- Sentry `beforeSend` scrubs credentials from error events.

### Data Protection

- Passwords hashed with bcrypt (cost 12); `select: false` on schema.
- Reset/verification tokens stored as SHA-256 hashes, never plaintext.
- Tax document `file_url` encrypted at rest (AES-256-GCM via `TAX_FIELD_ENCRYPTION_KEY`).
- Sensitive fields excluded from default serialization via `standardizeSchema` transform (`password`, `reset_password_token`, `email_verify_token`, `__v`).

### Frontend Security

- Token stripped from URL after `?token=` consumption (prevents leakage via history/Referer).
- `dompurify` for HTML sanitization.
- Microsoft Clarity is strictly opt-in (cookie consent), respects Do Not Track, sends zero PII, and purges cookies on rejection.
- Sentry envelope tunnel avoids direct browser-to-`*.ingest.sentry.io` connections (tracker-blocking bypass) with anti-relay DSN verification.
- PWA service worker never intercepts API calls.

### Security Matrix

```
┌──────────────────────────────────────────────────────────┐
│                 SECURITY LAYERS MATRIX                   │
├───────────────┬───────────────────────┬──────────────────┤
│ Layer         │ Mechanism             │ Status           │
├───────────────┼───────────────────────┼──────────────────┤
│ Transport     │ HTTPS (Render/Vercel) │ ✅ Enforced      │
├───────────────┼───────────────────────┼──────────────────┤
│ Auth          │ JWT HS256 + jti       │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Session Revoke│ session_version bump  │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Password      │ bcrypt cost 12        │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Brute Force   │ 5 fails → 30min lock  │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Injection     │ express-mongo-sanitize│ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Rate Limit    │ Per endpoint/IP/user  │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Headers       │ Helmet + CORS         │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Audit         │ Winston file log      │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Errors        │ Sentry (scrubbed)     │ ✅ Production    │
├───────────────┼───────────────────────┼──────────────────┤
│ Encryption    │ AES-256-GCM (tax docs)│ ✅ Production    │
└───────────────┴───────────────────────┴──────────────────┘
```

---

## 📈 **Performance & Observability**

### Caching Strategy

- **Backend**: LRU cache for FX rates (5-min TTL, max 500 entries) and AI insights (5-min TTL per user+metrics key). Market data prices cached 15 minutes.
- **Frontend**: TanStack React Query with `staleTime: 5 min`, `gcTime: 15 min`, `retry: 1`, `refetchOnWindowFocus: false`.
- **PWA**: Service Worker cache-first for static assets, stale-while-revalidate for navigation.
- **Vercel**: `Cache-Control: public, max-age=31536000, immutable` for hashed assets.

### Database Performance

- Mongoose connection pool: min 5, max 50, `w: 'majority'`, `retryWrites: true`.
- Targeted indexes on all models (user_id + date, user_id + is_deleted, cursor pagination compound index, unique constraints, sparse indexes).
- Budget GET loads expense transactions once and reuses for progress + rollover (avoids N+1).
- Transaction cursor pagination (base64-encoded `{date, _id}`) avoids `skip()` performance degradation on large datasets.
- Migration-based schema versioning replaces per-boot "self-healing" updates.

### Monitoring & Logging

- **Winston**: `logger` (console, debug/info level) + `auditLogger` (file `backend/audit.log`, JSON lines).
- **Morgan**: HTTP logging with `:id` request correlation token; health probes skipped in production.
- **Sentry**: Server (`@sentry/node`) + client (`@sentry/react`) error tracking with trace sampling (20%) and credential redaction.
- **Web Vitals**: `reportWebVitals.js` initialized on app start.
- **Lighthouse**: `.lighthouserc.json` for CI performance auditing.

### Resilience

- MongoDB connection with bounded exponential-backoff retries (max 5 attempts, 8s cap).
- Fail-fast: server exits if MongoDB unreachable (cannot serve authenticated requests).
- Graceful shutdown: SIGTERM/SIGINT/unhandledRejection/uncaughtException close HTTP server + MongoDB within 10-second force timeout.
- AI features degrade gracefully: missing Gemini API key → offline fallback responses at HTTP 200.
- FX rates: 4-layer fallback (cache → upstream → stale → static table); never throws.
- Market data: production returns empty (no fabricated prices); dev uses mock fixtures.
- Email: dev mode logs to console when SMTP unconfigured.

### Performance Metrics (Target)

| Metric | Value | Optimization |
|:-------|:------|:-------------|
| **First Contentful Paint** | < 1.0s | Preload critical assets, skeleton routes |
| **Largest Contentful Paint** | < 1.5s | Lazy-loaded routes, optimized images |
| **Time to Interactive** | < 2.0s | Code splitting, deferred JS |
| **Total Blocking Time** | < 200ms | Minimal main thread work |
| **Cumulative Layout Shift** | < 0.1 | Fixed dimensions, skeletons |
| **JS Bundle (gzip)** | < 1.5 MB | size-limit budget, tree-shaken |
| **API p95 Latency** | < 300ms | Indexes, connection pool |
| **Uptime SLA** | 99.9% | Fail-fast + graceful degradation |

---

## 🚢 **Deployment & DevOps**

### Local Development

```bash
# Install all dependencies (backend + frontend)
npm install

# Boot backend (port 5001) + Vite (port 5173), opens browser
npm start

# Reset database (destructive)
npm run db:reset

# Run all tests (backend + frontend)
npm test
```

### Environment Variables

**Backend** (`backend/.env`):

```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-here
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
SENTRY_DSN=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=MyCoinwise <noreply@mycoinwise.app>
RESET_TOKEN_EXPIRY_MINUTES=60
FINNHUB_API_KEY=
FRONTEND_URL=http://localhost:5173
CLIENT_URL=
ALLOWED_ORIGINS=
FEATURE_TAX_MODULE=true
TAX_FIELD_ENCRYPTION_KEY=
TAX_ADMIN_TOKEN=
MAX_EXPORT_ROWS=50000
MAX_BACKUP_DOCS=100000
ENABLE_DIAGNOSTIC_ECHO=false
TRUST_PROXY=false
```

**Frontend** (`.env.local` or Vercel env):

```env
VITE_API_URL=http://localhost:5001/api
VITE_SENTRY_DSN=
VITE_CLARITY_PROJECT_ID=
```

### Production Deployment

| Component | Platform | URL |
|-----------|----------|-----|
| Backend | Render.com | `https://nine-budgettracker.onrender.com` |
| Frontend | Vercel | (auto-assigned) |
| Database | MongoDB Atlas | (managed) |

**Render configuration:**

- Build command: `npm install`
- Start command: `node backend/server.js` (or `npm start` at root)
- Node version: 22
- Environment: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, etc.

**Vercel configuration:**

- Framework: Vite
- Build command: `npm --prefix frontend run build`
- Output directory: `frontend/dist`
- Rewrites: SPA fallback to `index.html`
- Security headers from `vercel.json`

### CI / Quality Gates

- `size-limit` budget: main app + vendors ≤ 1.5 MB.
- `rollup-plugin-visualizer` for bundle analysis in dev.
- ESLint flat config.
- Vitest for unit tests; Playwright for E2E.
- `verify-all-pipelines.js` and `verify-browser-screenshots.mjs` for pipeline verification.
- `.lighthouserc.json` for Lighthouse CI.

### Deployment Flow Diagram

```
    ┌──────────────┐
    │  Developer   │
    │  (local)     │
    └──────┬───────┘
           │ git push
           ▼
    ┌──────────────┐
    │   GitHub     │
    │   main       │
    └──────┬───────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│  Render │ │ Vercel  │
│ Backend │ │Frontend │
└────┬────┘ └────┬────┘
     │           │
     └─────┬─────┘
           ▼
    ┌──────────────┐
    │   MongoDB    │
    │   Atlas      │
    └──────────────┘
```

---

## ⚡ **Installation & Setup**

### 📦 **Prerequisites**

- Node.js ≥ 22.0.0
- npm ≥ 10.0.0
- MongoDB (local or Atlas)
- Optional: Google Gemini API key (for AI features)
- Optional: Sentry DSN (for error tracking)
- Optional: SMTP credentials (for email)

### 🚀 **Quick Start**

```bash
# 1. Clone the repository
git clone https://github.com/skens-git-code/9-MyCoinwise.git
cd 9-MyCoinwise

# 2. Install all dependencies
npm install

# 3. Configure backend env
cp backend/.env.example backend/.env
# Edit backend/.env with MONGO_URI and JWT_SECRET

# 4. (Optional) Configure frontend env
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local with VITE_API_URL

# 5. Start full stack (backend + Vite + browser)
npm start
```

The launcher opens the browser automatically once both services are ready.

### 🔧 **Manual Start (Two Terminals)**

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev   # or: node server.js

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 🗄️ **Database Setup**

```bash
# Reset the database (creates fresh collections + indexes)
node backend/scripts/reset-db.js

# Seed tax rules (India 2024 + US Federal 2024)
node backend/scripts/seed-tax-rules.js
```

### 🧪 **Run Tests**

```bash
# All tests
npm test

# Backend only
node backend/scripts/run-tests.js

# Frontend only
npm --prefix frontend test

# Frontend with coverage
npm --prefix frontend run test:coverage

# E2E (Playwright)
npm --prefix frontend run test:e2e
```

---

## 🧪 **Testing & Quality Assurance**

### ✅ **Test Coverage Matrix**

| Suite | Scope | Status |
|:------|:------|:-------|
| **Backend unit** | Auth, pagination, sanitize, tax engine, timezone | ✅ |
| **Backend integration** | Security flows, session revocation, rate limits | ✅ |
| **Frontend unit** | 17 Vitest test files across pages and utilities | ✅ |
| **E2E** | Playwright flows (auth, transaction, export) | ✅ |
| **Cross-browser** | Chrome, Firefox, Safari, Edge | ✅ |
| **Responsive** | 320px → 4K (12 breakpoints) | ✅ |
| **Accessibility** | axe-core + manual testing | ✅ |
| **Performance** | Lighthouse CI | ✅ |

### 🐛 **Known Issues & Solutions**

| Issue | Impact | Solution |
|:------|:-------|:---------|
| iOS backdrop-filter performance | Minor | Fallback to solid colors on low-power mode |
| Web Speech API inconsistent | Moderate | Not used in MyCoinwise (portfolio only) |
| Three.js on mobile battery | N/A | Not used in MyCoinwise |
| Render cold starts | Minor | 50-second Axios timeout tolerates |
| Live market data not wired | Minor | Finnhub block commented; can be enabled |

---

## 🧭 **Feature Deep-Dive**

### 💸 Transaction Statement Import

The backend supports CSV bank statement import with two phases:

1. **Preview** (`POST /api/transactions/statement/preview`) — Parses comma- or semicolon-delimited CSV (up to 5 MB, 1000 rows), classifies each row as income/expense, and returns candidate transactions with confidence scores.

2. **Import** (`POST /api/transactions/statement/import`) — Accepts selected rows, generates an `import_fingerprint` per row (SHA-like hash of date + amount + merchant + note), and dedups against existing transactions with the same fingerprint. Uses atomic upsert to be race-safe.

The `transactionIntegrityKey` utility generates a stable identity for dedup: import fingerprint → recurrence instance key → transaction number → created_at → composite manual key.

### 🔁 Recurring Transactions

Recurring transactions are processed lazily on list fetch (with a 15-minute cooldown per user) and can be force-processed via `POST /api/transactions/process-recurring`.

Each recurring parent has:
- `recurrence_interval` (daily/weekly/monthly/yearly)
- `recurrence_ends_at` (optional)
- `parent_transaction_id` (self-ref)
- `recurrence_instance_key` (unique partial index per user)

Instances are created via **atomic upsert** keyed on `recurrence_instance_key` to prevent duplicates even under concurrent processing.

### 💰 Net-Worth Snapshot Engine

`takeSnapshot(userId)` in `snapshotEngine.js`:

1. Loads all active `WealthItem` records for the user.
2. Hydrates prices via `marketDataService.fetchPrices()` (dev mocks / empty production).
3. Applies depreciation to `illiquid_asset` and `business_equity` classes: `baseValue × (1 − rate)^yearsOwned`.
4. Buckets into assets vs liabilities.
5. Upserts one `NetWorthHistory` record per user per month (pinned to month start).

`runGlobalSnapshots()` iterates all active users and runs `takeSnapshot` via `Promise.allSettled` — suitable for a CRON trigger.

### 🧮 Tax Engine

`taxEngine.js` is a **pure, dependency-free** module with no DB or HTTP imports. This makes it fully unit-testable and deterministic.

Exports:

- `calculateIncomeTax` — Progressive brackets, deductions, credits, rebate, surcharge, cess. US: max(standard, itemized); India: stacking allowed.
- `calculateCapitalGains` — Short/long-term with holding period rules.
- `calculateSalesTaxSummary` — Grouped by category.
- `calculateDeductions` — Tagged transactions + profile deductions.
- `calculateCredits` — Summarized credits with gross income gates.
- `estimateAnnualTax` — Top-level orchestrator returning `{totalLiability, totalPaid, balanceDue, refund}`.
- `roundMoney` — Two-decimal rounding.

Tax rules are versioned in `services/taxRules/`:
- `india-2024.js` — New vs old regime brackets, 87A rebate, surcharge, 4% cess, 80C/80D deductions.
- `us-federal-2024.js` — 2024 federal brackets, standard deduction, itemized, credits.

### 🤖 AI Integration

**Gemini 2.5 Flash** powers three surfaces:

1. **AI Chat** (`/api/ai/chat`) — Financial context (recent non-deleted transactions + active goals), history capped at 20 turns, consecutive same-role turns merged, 20-second timeout via `AbortSignal.timeout`.

2. **Wealth Insights** (`/api/wealth/ai-insights`) — Rate-limited 20/15min, cached 5 min per user+metrics+currency key.

3. **Cashflow Insights** (`/api/cashflow/ai-insights`) — 15-second timeout, fallback insight returned at HTTP 200 so Axios clients render it.

API key is sent via `x-goog-api-key` header (not query string) to avoid log leakage. Missing key yields:
- Chat: 503 error
- Insights: offline fallback at HTTP 200

### 📤 Export & Backup

**Excel export** (`GET /api/export/:userId`):

- Server-side generation with `exceljs`.
- Capped at `MAX_EXPORT_ROWS` (default 50,000); overflow reported in a Summary sheet.
- Columns: date, type, category, amount, currency, account, merchant, note, tags, created_at.

**Full backup** (`GET /api/export/backup/:userId`):

- Version 5 JSON backup of every user collection: transactions, goals, subscriptions, events, wealth items, net worth history, budgets, accounts, calculations, tax profiles/tags/payments/documents.
- Soft-deleted rows filtered, `__v` stripped.
- Filenames use local date (no UTC shift).

**PDF statements** (`frontend/src/services/pdfExport.js`):

- Executive A4 layout with jspdf + jspdf-autotable.
- SHA-256 audit hash.
- Running balance column.
- Integer-cents money math (no float drift).
- Latin-numeral locale formatting.
- Zebra rows, continuation page headers/footers.
- Blob download fallback for Safari.

### 🌐 Currency System

14 supported currencies: USD, INR, EUR, GBP, JPY, CAD, AUD, SGD, AED, CHF, CNY, MXN, BRL, KRW, THB.

- **Backend**: `fxRates.js` 4-layer fallback (cache → upstream → stale → static).
- **Frontend**: `currencyRates.js` fetches from `/api/currency/rates` (first-party, tracker-safe).
- **Static fallback** (INR per unit): USD 83.5, EUR 90.2, GBP 105.8, JPY 0.56, etc.
- **Conversion**: All user balances normalized to INR for cross-account aggregation; displayed in user's preferred currency.

---

## 🔮 **Roadmap 2025-2026**

### 🚧 **Q3 2025**

- [ ] **Live Market Data** — Wire Finnhub for real-time prices
- [ ] **Bank Open-Banking** — Plaid/Finicity integration
- [ ] **Automated Net-Worth Snapshots** — CRON trigger
- [ ] **Email Verification Flow** — End-to-end verification UX

### 🚀 **Q4 2025**

- [ ] **Multi-Currency Accounts** — Per-account currency with conversion
- [ ] **Advanced Tax** — State-level US taxes, GST for India
- [ ] **AI Budget Recommendations** — Gemini-driven budget creation
- [ ] **Portfolio Rebalancing** — Allocation drift alerts

### 💫 **2026 Vision**

- [ ] **Mobile Apps** — React Native iOS + Android
- [ ] **Household Collaboration** — Real-time multi-user editing
- [ ] **Open Banking** — Automated transaction sync
- [ ] **Tax Filing Integration** — Direct filing APIs
- [ ] **Blockchain** — On-chain wealth tracking (optional)

---

## 🤝 **Contributing**

Contributions are welcome! Whether it's bug fixes, feature suggestions, or design improvements:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-idea`)
3. **Commit** your changes (`git commit -m 'Add some amazing idea'`)
4. **Push** to branch (`git push origin feature/amazing-idea`)
5. **Open** a Pull Request

### 📝 **Guidelines**

- Maintain **ES6+** syntax
- Add **JSDoc** comments for new functions
- Test across **3+ browsers**
- Ensure **WCAG compliance**
- Follow **existing code style**
- Run `npm test` before submitting

### 🐛 **Reporting Bugs**

When reporting a bug, please include:

- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Environment (browser, OS, version)
- Relevant logs (from browser console or `backend/audit.log`)

---

## 📄 **License**

**ISC License** — Free for personal and commercial use.

```
Copyright (c) 2025-2026 Sarthak Mathapati

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 🙏 **Acknowledgments**

### 🎓 **Education & Mentors**

- **Newton School of Technology** — Cutting-edge AI curriculum
- **Rishihood University** — Holistic development approach
- **Jawahar Navodaya Vidyalaya** — Foundation of excellence
- **Aakash BYJU'S** — IIT-JEE preparation journey

### 💻 **Technologies & Tools**

- **Google Gemini** — Powering intelligent financial conversations
- **MongoDB** — Reliable document store
- **Express** — Battle-tested web framework
- **React** — Composable UI library
- **Vite** — Lightning-fast build tool
- **TanStack Query** — Server state management
- **Winston** — Structured logging
- **Sentry** — Production error tracking
- **Recharts** — Beautiful financial charts
- **Framer Motion** — Smooth animations

### 🌟 **Inspiration**

- The open-source community
- Fellow developers at Skens.inc
- Every user who provides feedback
- The future of personal finance technology

---

## 📬 **Connect**

<div align="center">

**Sarthak Sidalingayya Mathapati**  
*AI Software Engineer & Full-Stack Architect*

<br>

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/skens-git-code)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/sarthak-mathapati-b2b04430a)
[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://x.com/mathapatism8)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/mathapati.i8)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:sarthakmathapati4@gmail.com)

<br>

**📞 +91 93567 07688** · **📧 sarthakmathapati4@gmail.com**  
**📍 Newton School of Technology, Delhi**

</div>

---

## 📎 **Appendix**

### A. Master Backend Component List

**Core (6):**

1. `server.js` — Express app, middleware, routes, lifecycle
2. `config/env.js` — envalid-validated environment
3. `db.js` — Mongoose connection with retry/backoff
4. `utils/logger.js` — Winston logger + auditLogger
5. `utils/transactionIntegrity.js` — Dedup + future-date handling
6. `utils/schemaStandardizer.js` — Mongoose standardization plugin

**Middleware (4):**

7. `middleware/auth.js`
8. `middleware/admin.js`
9. `middleware/ownership.js`
10. `middleware/sanitizeRequest.js`

**Models (17):**

11. `models/User.js`
12. `models/Transaction.js`
13. `models/Account.js`
14. `models/Budget.js`
15. `models/Goal.js`
16. `models/Event.js`
17. `models/Subscription.js`
18. `models/WealthItem.js`
19. `models/NetWorthHistory.js`
20. `models/Calculation.js`
21. `models/LoginLog.js`
22. `models/Session.js`
23. `models/TaxProfile.js`
24. `models/TaxRuleSet.js`
25. `models/TaxTag.js`
26. `models/TaxPayment.js`
27. `models/TaxDocument.js`

**Routes (17):**

28. `routes/auth.js`
29. `routes/users.js`
30. `routes/transactions.js`
31. `routes/accounts.js`
32. `routes/budgets.js`
33. `routes/goals.js`
34. `routes/wealth.js`
35. `routes/cashflow.js`
36. `routes/events.js`
37. `routes/subscriptions.js`
38. `routes/calculations.js`
39. `routes/currency.js`
40. `routes/security.js`
41. `routes/tax.js`
42. `routes/export.js`
43. `routes/ai.js`
44. `routes/telemetry.js`

**Services (5 + 2 rules):**

45. `services/taxEngine.js`
46. `services/marketDataService.js`
47. `services/snapshotEngine.js`
48. `services/emailService.js`
49. `services/fxRates.js`
50. `services/taxRules/india-2024.js`
51. `services/taxRules/us-federal-2024.js`

**Migrations (2):**

52. `migrations/index.js`
53. `migrations/repair-balances.js`

**Scripts (10):**

54. `scripts/reset-db.js`
55. `scripts/run-tests.js`
56. `scripts/seed-and-benchmark.js`
57. `scripts/seed-tax-rules.js`
58. `scripts/audit-e2e-reset-profile.js`
59. `scripts/cleanup-duplicates-and-balances.js`
60. `scripts/measure-auth-after.js`
61. `scripts/measure-auth-baseline.js`
62. `scripts/soak-auth.js`
63. `scripts/verify-all-pipelines.js`

**Tests (7):**

64. `test/auth-middleware.test.js`
65. `test/pagination.test.js`
66. `test/request-sanitize.test.js`
67. `test/security-integration.test.js`
68. `test/taxEngine.test.js`
69. `test/transaction-timezone.test.js`
70. `test/helpers/integrationHarness.js`

### B. Master Frontend Component List

**Core (5):**

1. `src/main.jsx`
2. `src/App.jsx`
3. `src/contexts/AppContext.jsx`
4. `src/lib/queryClient.js`
5. `src/reportWebVitals.js`

**Pages (22):**

6–27. Dashboard, Transactions, Analytics, Accounts, Budgets, Goals, Subscriptions, Cashflow, Wealth, SettingsPage, Calendar, Tax, Calculator, Login, Register, ForgotPassword, ResetPassword, VerifyEmail, About, Terms, Privacy, Reports, NotFound

**Components (20+):**

28–47. AppLayout, TransactionForm, AIChat, AlertsCenter, AnimatedNumber, Breadcrumbs, CommandPalette, CookieBanner, CurrencyConverter, ErrorBoundary, ErrorState, FixedSizeList, Footer, HelpModal, KeyboardShortcutsModal, Loader, Modal, OnboardingTour, ProtectedRoute, ToastProvider

**Tax Components (6):**

48–53. TaxBracketChart, TaxDisclaimer, TaxEstimateCard, TaxPaymentForm, TaxProfileForm, taxProfileDefaults.js

**Skeletons (2):**

54–55. RouteSkeletons.jsx, index.js

**Services (6):**

56–61. api.js, aiEngine.js, pdfExport.js, i18n.js, clarity.js, quantumRuntime.js

**Utils (7):**

62–68. csvUtils.js, currencyRates.js, currencyUtils.js, dateUtils.js, deviceTier.js, d3-tilt.js, transactionIntegrity.js

**Hooks (4):**

69–72. useCountUp.jsx, useDelayedLoading.js, useFocusTrap.js, useMediaQuery.js

**Styles (21 SCSS partials):**

73–93. main.scss, _variables.scss, _mixins.scss, _base.scss, _layout.scss, _themes.scss, _amoled.scss, _auth.scss, _components.scss, _custom.scss, _dashboard.scss, _depth.scss, _loader.scss, _mobile-perf.scss, _mobile.scss, _notifications.scss, _page-enhancements.scss, _plain-ui.scss, _portfolio.scss, _responsive-fixes.scss, _settings.scss, _transactions.scss

**Tests (17):**

94–110. setup.js + 16 test files

**Public (6):**

111–116. manifest.json, sw.js, favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png

**Config (6):**

117–122. vite.config.js, vitest.config.js, eslint.config.js, vercel.json, package.json, .env.example

**Root (4):**

123–126. start.js, start.sh, package.json, scripts/

### C. Environment Variable Quick Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `MONGO_URI` | ✅ | — | MongoDB connection |
| `JWT_SECRET` | ✅ | — | JWT signing key |
| `PORT` | ❌ | 5001 | HTTP listen port |
| `NODE_ENV` | ❌ | development | Runtime environment |
| `FRONTEND_URL` | ❌ | http://localhost:5173 | Primary CORS origin |
| `GEMINI_API_KEY` | ❌ | "" | AI features (blank = disabled) |
| `SENTRY_DSN` | ❌ | "" | Error tracking (blank = disabled) |
| `SMTP_*` | ❌ | — | Email (blank = console logs) |
| `FEATURE_TAX_MODULE` | ❌ | true | Tax Center feature flag |
| `TAX_ADMIN_TOKEN` | ❌ | "" | Admin seed token |
| `TAX_FIELD_ENCRYPTION_KEY` | ❌ | "" | AES-256-GCM key |

### D. Supported Currencies

`USD` · `INR` · `EUR` · `GBP` · `JPY` · `CAD` · `AUD` · `SGD` · `AED` · `CHF` · `CNY` · `MXN` · `BRL` · `KRW` · `THB`

### E. Supported Languages

`en` · `hi` · `mr` · `bgc` · `kn`

### F. Version History

```
v1.0.4 (2026)   🚀 Current
├── Tax Center (India + US)
├── AI Financial Coach (Gemini)
├── Net-Worth Snapshot Engine
├── Cursor Pagination
├── Sentry Tunnel
├── Full Backup v5
└── 5-language i18n

v1.0.3 (2025)   ⚡ Pre-Release
├── Full CRUD across all modules
├── PWA + Service Worker
├── Recurring Transactions
├── Statement Import
└── Household Model

v1.0.0 (2025)   🌱 Foundation
├── Basic transaction tracking
├── Accounts + Budgets + Goals
├── JWT authentication
└── Responsive UI
```

---

<div align="center">
  <br>
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,2,4,6,8&height=150&section=footer&text=Track%20Wealth.%20Master%20Budgets.&fontSize=28&fontColor=white&animation=twinkling" />
  <br>
  <br>

  <p><strong>✨ Built with 🧠, ☕, and an unwavering belief that financial clarity can change lives ✨</strong></p>

  <br>

  <sub>© 2025-2026 Sarthak Mathapati. All rights reserved. | Last updated: October 2026 | Version 1.0.4</sub>
  <br>
  <sub>📍 Delhi, India · Available for opportunities 24/7</sub>

  <br>
  <br>

  <a href="#-mycoinwise--smart-personal-finance--budgeting-tracker"><img src="https://img.shields.io/badge/⬆️-Back%20to%20Top-007AFF?style=for-the-badge" /></a>
</div>
