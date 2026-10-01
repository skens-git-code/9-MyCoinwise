# MyCoinwise – Smart Financial Tracker

A full-stack, responsive personal finance tracking and budgeting web application.

---

## ⚡ Quick Start (One Command)

From the project root directory, run any of the following to launch both the backend and frontend servers and automatically open the application in your default browser:

```bash
npm start
```

or:

```bash
./start.sh
```

or:

```bash
node start.js
```

### What this does:
1. Starts the Express backend on `http://localhost:5001`.
2. Connects to MongoDB and verifies backend health check (`/api/health`).
3. Starts the Vite frontend on `http://localhost:5173`.
4. Automatically opens `http://localhost:5173` in your browser.
5. Pressing `Ctrl + C` cleanly stops both servers.

---

## 🧪 Testing & Verification

The project includes an end-to-end automated verification pipeline:

### 1. Frontend Test Suite (55 Unit & Integration Tests)
Runs Vitest across all 15 pages, components, hierarchy calculations, and calendar logic:
```bash
npm test
```

### 2. Backend Architecture & Pipeline Verification (52 Architectural Pipelines)
Verifies all 17 system pipelines (Health, Auth, Accounts, Transactions, Budgets, Goals, Subscriptions, Wealth, Cashflow AI, Calculations, Calendar, Tax Center, Security, Export/Backup, User Deletion Cascade):
```bash
node backend/scripts/verify-all-pipelines.js
```

### 3. Backend Syntax & Integrity Checks
```bash
npm --prefix backend test
```

---

## 🏗️ Architecture & Modules

- **Authentication & Security**: Multi-factor session tokens, argon2/bcrypt password hashing, rate limiting, and cascade data protection.
- **Transactions & Statements**: Multi-currency ledger with CSV bank statement parsing, categorization, and balance reconciliation.
- **Budgeting & Savings Goals**: Real-time spending limits, surplus tracking, and visual progress tracking.
- **Wealth & Net Worth**: Multi-asset tracking, liabilities, and debt-to-asset ratio analytics.
- **Cashflow Forecasting & AI Insights**: Configurable projection curves (30–365 days), safety floors, and AI recommendations.
- **Tax Center**: Multi-jurisdiction (US/India) progressive tax estimators, capital gains, advance tax schedules, and checklist.
- **Cross-Device UI**: Responsive glassmorphism interface supporting Desktop (1440px+), Tablet (768px), and Mobile (375px) with adaptive drawers and bottom dock navigation.

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
