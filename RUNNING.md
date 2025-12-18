# Project Setup Instructions

This project has been refactored into a separate **Frontend (Next.js)** and **Backend (Express)**.

## Prerequisites
- Node.js (v18+ recommended)
- MongoDB Connection URI
- GitHub Token (optional, for GitHub ingestion)

## 1. Backend Setup
The backend handles database connections, LangChain logic, and file ingestion.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server (Dev Mode):
   ```bash
   npm run dev
   ```
   The backend will run on `http://localhost:3001`.

## 2. Frontend Setup
The frontend handles the UI and communicates with the backend via API proxies.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the frontend (Dev Mode):
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:3000`.

## Configuration
- **Backend**: `.env` is located in `backend/.env`. Ensure `MONGODB_URI` is set.
- **Frontend**: `.env` is located in `frontend/.env`.
- **Proxy**: The frontend is configured to proxy requests starting with `/api` to `http://localhost:3001/api`.

## Key Changes
- Moved all backend logic (LangChain, MongoDB, file processing) to `backend/src`.
- Removed API routes from Next.js (`frontend/app/api`).
- Next.js now acts as a pure UI layer.
