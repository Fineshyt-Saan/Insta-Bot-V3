# Deployment & Operations Guide

## 1. Prerequisites

- **Node.js:** v20.18.1 or higher (LTS recommended)
- **Instagram Account:** Cookies exported from a web browser or valid email/password credentials.
- **FFmpeg (Optional):** Required only if advanced on-the-fly audio transcoding is utilized.

---

## 2. Setup & Configuration

### A. Clone and Install Dependencies
```bash
git clone https://github.com/frnAlt/InstaBOT.git
cd InstaBOT
npm install
```

### B. Environment Variables (`.env`)
Create a `.env` file in the root directory:
```ini
# Bot Core Configuration
PREFIX=!
PORT=3000

# Instagram Credentials (Choose either Cookie or Email/Password)
# Option 1: Cookies (Recommended)
ACCOUNT_COOKIE="sessionid=...; ds_user_id=...; csrftoken=...;"

# Option 2: Email & Password
ACCOUNT_EMAIL="your_instagram_username"
ACCOUNT_PASSWORD="your_instagram_password"

# Bot Roles
ADMIN_BOT=["your_instagram_user_id"]
DEV_USERS=["your_instagram_user_id"]

# Optional: Remote RPC Server Mode
# IG_API_SERVER="https://your-rpc-instance.example.com"
# IG_API_TOKEN="secret_token"
```

Alternatively, paste your raw exported cookies into `account.txt`.

---

## 3. Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Process Management with PM2
```bash
npm install -g pm2
pm2 start index.js --name instabot
pm2 logs instabot
```

---

## 4. Health Checks & Status Dashboard

InstaBOT includes an embedded HTTP health check server on port `3000` (or `process.env.PORT`):
- `GET /` — Real-time status dashboard displaying bot uptime, memory usage, command metrics, and active connection status.
- `GET /health` — JSON endpoint returning `{ status: "ok", uptime, botUserID, timestamp }` for cloud load balancers and container orchestrators (e.g. Render, Railway, AWS ECS, Fly.io).
- `GET /ping` — Lightweight `200 OK` ping responder.
