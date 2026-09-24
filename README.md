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
