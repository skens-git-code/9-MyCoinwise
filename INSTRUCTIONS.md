# Budget Tracker - Setup & Deployment Guide

This guide provides step-by-step instructions for running the Budget Tracker application locally and deploying it to production.

---

## 💻 Local Execution

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18.0.0 or higher)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) or local MongoDB instance

### 1. Setup Backend
1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and fill in your `MONGO_URI`, `JWT_SECRET`, and `GEMINI_API_KEY`.
4. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The backend will be running at `http://localhost:5001`.*

### 2. Setup Frontend
1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Make sure `.env.local` contains the following:
     ```env
     VITE_API_URL=http://localhost:5001/api
     ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *The frontend will be running at `http://localhost:5173`. Open this URL in your browser to interact with the app.*

### 3. Verify Your Local Setup
- Creating an account should successfully insert a user document into your MongoDB.
- You can add transactions and test out the core features without errors.
- You can run `npm run build` in the `frontend` to test a production build locally.

---

## 🚀 Deployment Guide

### Deploying the Backend (Recommended: Render)
1. Push your code to a GitHub repository.
2. Go to [Render](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Set the following details:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Go to the "Environment" tab and add the necessary variables (`MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`). Also add:
   - `FRONTEND_URL=https://<your-vercel-domain>.vercel.app` (This handles CORS in production).
6. Deploy the service. Once live, note the backend URL (e.g., `https://mycoinwise-api.onrender.com`).

### Deploying the Frontend (Recommended: Vercel)
1. Go to [Vercel](https://vercel.com/) and create a new **Project**.
2. Import your GitHub repository.
3. Configure the settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
4. Go to Environment Variables and add:
   - `VITE_API_URL` set to your Render backend URL with `/api` appended (e.g., `https://mycoinwise-api.onrender.com/api`).
5. Deploy the project.

### CORS & Security Notes
- The backend is configured to allow requests from `http://localhost:5173`, `http://localhost:5174`, and the domain specified in the `FRONTEND_URL` environment variable.
- Ensure your `.env` and `.env.local` files are never committed to your repository. They are properly tracked in `.gitignore`.
