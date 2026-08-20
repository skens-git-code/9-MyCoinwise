# MyCoinwise

<p align="center">
  <strong>AI-powered personal finance, budgeting, and wealth tracking</strong><br />
  A polished full-stack budget tracker built for clarity, control, and confident financial decisions.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#project-structure">Project Structure</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white" alt="Node.js 18 or newer" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white" alt="MongoDB and Mongoose" />
  <img src="https://img.shields.io/badge/PWA-ready-5A0FC8" alt="Progressive Web App ready" />
</p>

## Overview

MyCoinwise brings daily money management into one focused workspace. Track transactions, accounts, budgets, goals, recurring commitments, cash flow, and wealth in a responsive interface that works on desktop and mobile.

The application combines a React/Vite frontend with a secured Express/MongoDB backend. It includes optional AI-powered insights, offline-aware UI states, export tools, and practical security controls without requiring sensitive financial data to be exposed in the client.

## Features

### Complete money management

- Dashboard with balance, income, expense, savings, and financial health summaries.
- Transactions with filtering, pagination, tags, merchants, payment methods, recurring entries, split transactions, notes, and audit history.
- Multiple accounts with account type, balance, institution, currency, and account-level views.
- Budgets by category with progress tracking, remaining limits, and period management.
- Goals with target amounts, deadlines, progress, and contributions.
- Subscriptions and recurring expenses with renewal visibility.
- Calendar events for planned financial activity.

### Insights and planning

- Analytics dashboards with category breakdowns and spending trends.
- Cash-flow forecasting and future balance visibility.
- Wealth items and net-worth history.
- Anomaly and unusual-spending signals.
- Optional AI chat and financial summaries powered by the configured Gemini API key.
- Built-in currency conversion and calculation tools.

### Premium usability

- Responsive layout for phones, tablets, and desktop screens.
- Light and AMOLED themes with consistent design tokens.
- Command palette, keyboard shortcuts, quick-action FAB, onboarding tour, help center, and toast feedback.
- Multilingual interface support including English, Hindi, Marathi, Haryanvi, and Kannada.
- Installable PWA with service-worker caching and offline-aware connection/saving status.
- Accessible labels, focusable controls, semantic page structure, and reduced-motion-friendly interactions.

### Data portability

- CSV, Excel, PDF, and JSON exports.
- JSON backup and restore for transferring or protecting personal records.
- Printable reports for transactions and financial summaries.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         MyCoinwise UI                        │
│ React 19 • Vite • React Router • SCSS • Recharts • PWA       │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS / JSON API
┌───────────────────────────────▼──────────────────────────────┐
│                       Express API Server                     │
│ Auth • Transactions • Budgets • Accounts • Goals • Analytics  │
│ Export • Cashflow • Wealth • AI • Security • Calculations    │
└───────────────────────────────┬──────────────────────────────┘
                                │ Mongoose
┌───────────────────────────────▼──────────────────────────────┐
│                         MongoDB                               │
│ Users • Sessions • Transactions • Budgets • Goals • Accounts  │
│ Events • Subscriptions • Wealth • Audit and login records     │
└──────────────────────────────────────────────────────────────┘
```

## Security

- JWT authentication with protected API routes.
- Password hashing with bcrypt.
- Session persistence and revocation support.
- Ownership checks to prevent cross-user record access.
- Helmet security headers, CORS controls, compression, and rate limiting.
- Input validation for sensitive request paths.
- Login logs, password/session controls, and transaction audit records.
- Environment-based secrets; credentials are never required in source code.

> If a secret has ever been committed to a local or public file, rotate it before deployment. Use environment variables instead of copying credentials into this README.

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm
- MongoDB Atlas or a local MongoDB server
- Gemini API key only if AI features are enabled

### 1. Start the backend

```bash
cd backend
npm install
cp .env.example .env
```

Update `backend/.env`:

```env
PORT=5001
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-secret
GEMINI_API_KEY=optional-gemini-key
FRONTEND_URL=http://localhost:5173
```

Run the API:

```bash
npm run dev
```

The backend runs at `http://localhost:5001` and exposes a health check at `/api/health`.

### 2. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5001/api
```

Run the client:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Development Commands

### Frontend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

### Backend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API with Node watch mode |
| `npm start` | Start the production API |
| `npm test` | Run syntax and route verification checks |

## API Modules

The backend is organized by domain rather than by one large controller:

`/api/auth` · `/api/users` · `/api/transactions` · `/api/accounts` · `/api/budgets` · `/api/goals` · `/api/subscriptions` · `/api/events` · `/api/export` · `/api/calculations` · `/api/wealth` · `/api/cashflow` · `/api/ai` · `/api/security`

All user-specific resources require authentication and ownership validation. See the route files in `backend/routes` for request and response details.

## Project Structure

```text
9-BudgetTracker/
├── backend/
│   ├── middleware/       Authentication, ownership, validation, and errors
│   ├── models/           Mongoose schemas and indexes
│   ├── routes/           Feature-focused API modules
│   ├── services/         AI and domain services
│   ├── utils/            Shared backend utilities
│   └── server.js         Express application entry point
├── frontend/
│   ├── public/           PWA manifest, service worker, and icons
│   └── src/
│       ├── components/   Reusable layout, forms, feedback, and controls
│       ├── pages/        Route-level screens
│       ├── services/     API, AI, export, translation, and runtime helpers
│       └── styles/       Theme and component styling
└── README.md
```

## Deployment

### Backend on Render

1. Create a Web Service from this repository.
2. Set the root directory to `backend`.
3. Use `npm install` as the build command and `npm start` as the start command.
4. Add `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY` if needed, and `FRONTEND_URL` as environment variables.

### Frontend on Vercel

1. Import the same repository as a separate project.
2. Set the root directory to `frontend`.
3. Use the Vite framework preset.
4. Add `VITE_API_URL` with the deployed backend URL ending in `/api`.

Use HTTPS in production, restrict CORS to the deployed frontend origin, and never commit `.env` or `.env.local` files.

## Verification

The current project checks are passing:

| Area | Check | Result |
| --- | --- | --- |
| Frontend | `npm run lint` | Passing |
| Frontend | `npm run build` | Passing |
| Backend | `npm test` | Passing |

## Roadmap

- Automated end-to-end browser tests for the primary finance flows.
- Optional bank/provider integrations with explicit user consent.
- Stronger offline queue reconciliation for interrupted writes.
- More granular notification preferences and scheduled reports.
- Expanded budgeting templates and shared household workspaces.

## License

This project is currently distributed as a private/full-stack portfolio project. Add the intended open-source license here before publishing the repository for external reuse.

## Repository

[skens-git-code/9-BudgetTracker](https://github.com/skens-git-code/9-BudgetTracker)
