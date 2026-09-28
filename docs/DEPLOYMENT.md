# Production Deployment & Setup Guide

This document provides instructions for deploying **TaskFlow Pro** on AWS EC2, VPS instances, or Docker environments.

---

## 🌐 Live Production Deployment

- **Frontend Application**: [https://fe.opendraw.live/](https://fe.opendraw.live/)
- **REST API Endpoint**: `https://be.opendraw.live/api/v1`
- **WebSocket Gateway**: `wss://ws.opendraw.live`

---

## 🛠️ Environment Configuration

Create a `.env` file in the root directory based on `.env.production.example`:

```env
# Database
DATABASE_URL=postgresql://taskflow:securepassword@localhost:5432/taskflow
REDIS_URL=redis://localhost:6379

# Server Ports
PORT=4000
WS_PORT=4001
NODE_ENV=production

# Security
JWT_SECRET=your-at-least-32-character-secret-key-here
CORS_ORIGIN=https://fe.opendraw.live

# LLM / AI Suggestions (Optional)
LLM_API_KEY=sk-or-v1-your-key-here
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openrouter/free

# Frontend Public Endpoints (Baked into static build)
NEXT_PUBLIC_API_URL=https://be.opendraw.live/api/v1
NEXT_PUBLIC_WS_URL=wss://ws.opendraw.live
```

---

## 🚀 Deployment Options

### Option 1: Docker Compose (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/09ahmad/kanban-board-DAG.git
   cd kanban-board-DAG
   ```

2. Copy `.env.production.example` to `.env` and configure your production credentials:
   ```bash
   cp .env.production.example .env
   ```

3. Build and start all services with Docker Compose:
   ```bash
   docker compose up --build -d
   ```

---

### Option 2: Standalone Bun / Node Process Manager

1. Install project dependencies:
   ```bash
   bun install
   ```

2. Generate Prisma database client and push database schema:
   ```bash
   bun run db:generate
   bun run db:push
   ```

3. Build all workspace packages and Next.js static assets:
   ```bash
   bun run build --force
   ```

4. Start all production services via Turborepo:
   ```bash
   bun run start
   ```

---

## 🔧 Verification & Troubleshooting

- **Check Health Endpoints**:
  - REST API: `GET http://localhost:4000/health`
  - WebSocket: `GET http://localhost:4001/health`
- **Verify Database & Redis**:
  - Ensure PostgreSQL is accessible via `DATABASE_URL`.
  - Ensure Redis is running for BullMQ jobs and WebSocket Pub/Sub.
