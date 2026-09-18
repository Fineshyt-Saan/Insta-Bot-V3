# 📱 Instagram Setup & Authentication Guide

A complete step-by-step guide to configuring Instagram cookies, transport modes, administrators, and anti-ban protections in **InstaBOT**.

---

## 🍪 1. Instagram Cookie Authentication

InstaBOT connects to Instagram using active browser session cookies. This avoids password-based logins, prevents interactive 2FA friction on servers, and maintains an active session with Instagram Realtime.

### Step 1: Install Cookie-Editor Extension
Install the Cookie-Editor extension in your browser:
- [Chrome / Chromium Web Store](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)

### Step 2: Log into Instagram
1. Log into your dedicated bot account on [https://www.instagram.com](https://www.instagram.com).
2. Browse your feed or messages for a minute so normal session telemetry is populated.

### Step 3: Export Cookies
1. Click the **Cookie-Editor** extension icon in your browser toolbar.
2. Click **Export** at the bottom right.
3. Select **Netscape** format (recommended) or **JSON**.
4. The cookies will be copied to your clipboard.

### Step 4: Save to `account.txt`
1. In the root directory of your InstaBOT installation, create or open `account.txt`:
   ```bash
   cp account.txt.example account.txt
   ```
2. Paste the exported cookies into `account.txt` and save the file.
3. Verify that `sessionid` and `ds_user_id` are present in the file.

> [!TIP]
> You can also supply cookies via the `IG_COOKIES` environment variable, which takes precedence over `account.txt`. This is ideal for hosting environments like Docker, Render, Railway, or Heroku where persistent disk storage is not available.

---

## 🚀 2. Choosing Your Transport Mode

InstaBOT supports **two distinct transport architectures**:

### Mode A: Remote Server (Microservice / Cloud Deployment)
Best for containerized cloud hosts (Render, Railway, Fly.io) where memory footprint must stay low.
1. Deploy an instance of [`ig-chat-api-server`](https://github.com/lazyneoaz/ig-chat-api-server).
2. Configure `server.url` and `server.token` in `config.json`, or set environment variables:
   ```bash
   export IG_API_SERVER="https://your-server.example.com"
   export IG_API_TOKEN="your-secret-token"
   ```
3. Run `npm start`.

### Mode B: Direct Standalone Realtime ICA (Zero External Dependencies)
Connects directly to Instagram's WebSocket Realtime gateway (`wss://edge-chat.instagram.com/chat`) using the built-in hardened `ica/` engine.
1. Leave `server.url` empty (`""`) in `config.json`.
2. Ensure your valid cookies are in `account.txt`.
3. Run `npm start`. The bot will connect natively without any secondary server.

---

## 🛡️ 3. Admin Permissions & Privacy Modes

### Setting Up Bot Admins
To give your accounts full control over the bot:
1. Open `config.json` (or `config/default.json`) and add your numeric Instagram User ID:
   ```json
   "devUsers": ["36296727311", "49212864825"]
   ```
2. Or configure via environment variable:
   ```bash
   export IG_ADMIN_BOT="36296727311,49212864825"
   ```
3. You can also add or remove admins dynamically from chat:
   - `-admin add <userID or @username>`
   - `-admin remove <userID or @username>`
   - `-admin list`

### Default-Off & Admin-Only Modes
If you want the bot active but completely private to you and your co-admins:
- Set `"defaultOff": true` and `"adminOnly": { "enable": true }` in `config.json`.
- When enabled, **only administrators** can invoke commands, trigger replies, or run scripts.
- Any message, command attempt, or reply from a non-admin is **dropped completely silently** with zero output (matching Floppa bot logic).
- Toggle live in chat:
  - `-bot on` / `-bot off` (controls current chat)
  - `-bot defaultoff on` / `-bot defaultoff off` (controls global default)

---

## ⚠️ 4. Anti-Ban & Rate-Limit Prevention

Automating Instagram accounts carries inherent platform risks. Follow these proven operational rules:

1. **Use a Secondary/Dedicated Account:** Never run a bot on your primary personal Instagram account.
2. **Warm Up New Accounts:** Do not immediately add a brand-new account to 50 group chats. Use it normally for several days before automating.
3. **Respect Instagram Throttling:** If the bot logs a `429 Too Many Requests` or `checkpoint_required`, Instagram has temporarily throttled actions. Wait 15–30 minutes before resuming.
4. **Typing Indicators & Natural Delays:** Built-in typing jitter (40–200ms) and cooldowns are enabled by default to mimic human client behavior.
5. **Keep Cookies Fresh:** If your session expires or Instagram invalidates the login, simply re-export fresh cookies from your browser and update `account.txt`.
