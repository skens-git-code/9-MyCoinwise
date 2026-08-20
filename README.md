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
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/PWA-ready-5A0FC8" alt="PWA ready" />
  <img src="https://img.shields.io/badge/AI-Gemini-4285F4?logo=googlecloud" alt="Gemini AI" />
</p>

---

## Overview

**MyCoinwise** brings daily money management into one focused workspace. Track transactions, accounts, budgets, goals, recurring commitments, cash flow, and wealth in a responsive interface that works on desktop and mobile. The application combines a React/Vite frontend with a secured Express/MongoDB backend. It includes optional AI‑powered insights, offline‑aware UI states, export tools, and practical security controls – without requiring sensitive financial data to be exposed in the client.

---

## Features

### 💰 Complete Money Management
- **Dashboard** – Balance, income, expense, savings, and financial health summaries.
- **Transactions** – Filtering, pagination, tags, merchants, payment methods, recurring entries, split transactions, notes, and audit history.
- **Accounts** – Multiple account types, balances, institutions, currencies, and account‑level views.
- **Budgets** – Category‑based budgets with progress tracking, remaining limits, and period management.
- **Goals** – Target amounts, deadlines, progress tracking, and contributions.
- **Subscriptions** – Recurring expenses with renewal visibility.
- **Calendar** – Planned financial events.

### 📊 Insights & Planning
- **Analytics** – Category breakdowns and spending trends.
- **Cash‑flow Forecasting** – Future balance visibility.
- **Wealth Items** – Net‑worth history and tracking.
- **Anomaly Detection** – Unusual‑spending signals.
- **AI Chat & Summaries** – Powered by your Gemini API key.
- **Built‑in Tools** – Currency conversion and calculation.

### ✨ Premium Usability
- **Responsive** – Perfect on phones, tablets, and desktops.
- **Themes** – Light and AMOLED dark modes with consistent design tokens.
- **Command Palette** – Keyboard shortcuts, quick‑action FAB, onboarding tour, help center, and toast feedback.
- **Multilingual** – English, Hindi, Marathi, Haryanvi, and Kannada.
- **PWA** – Installable with service‑worker caching and offline‑aware connection/saving status.
- **Accessibility** – Labels, focusable controls, semantic structure, and reduced‑motion support.

### 📦 Data Portability
- Export to **CSV**, **Excel**, **PDF**, and **JSON**.
- **JSON backup/restore** for transferring or protecting records.
- **Printable reports** for transactions and financial summaries.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         MyCoinwise UI                        │
│ React 19 • Vite • React Router • SCSS • Recharts • PWA       │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS / JSON API
┌───────────────────────────────▼──────────────────────────────┐
│                       Express API Server                     │
│ Auth • Transactions • Budgets • Accounts • Goals • Analytics │
│ Export • Cashflow • Wealth • AI • Security • Calculations    │
└───────────────────────────────┬──────────────────────────────┘
                                │ Mongoose
┌───────────────────────────────▼──────────────────────────────┐
│                         MongoDB                              │
│ Users • Sessions • Transactions • Budgets • Goals • Accounts │
│ Events • Subscriptions • Wealth • Audit and login records    │
└──────────────────────────────────────────────────────────────┘
