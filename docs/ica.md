# Instagram Chat API (ICA) Native Subsystem

## 1. Overview

InstaBOT features its **own native ICA implementation** located under `ica/` and orchestrated through `platforms/instagram/`.

The transport supports dual-mode operation:
1. **Direct Mode (Embedded):** Connects directly from Node.js via WebSocket Secure (`wss://edge-chat.instagram.com/chat`) using tough-cookie session jars, Iris registration, and MQTT message synchronization.
2. **Remote Mode (RPC):** Connects to a remote Instagram API service instance (such as the RPC server from `lazyneoaz/Insta-Bot`) via HTTP POST `/rpc` and Server-Sent Events `/events`.

---

## 2. Authentication & Session Persistence

### Session Formats Supported
InstaBOT's `CookieUtils` automatically recognizes and deserializes:
1. Standard header strings: `sessionid=...; ds_user_id=...; csrftoken=...`
2. Netscape `cookies.txt` tab-separated dumps
3. JSON arrays of cookie objects: `[{ name, value, domain, path }, ...]`
4. Serialized tough-cookie stores: `{ httpSession: { cookies: { cookies: [...] } } }`
5. Object-keyed dictionary exports: `{ cookies: { "0": { name, value }, "1": { name, value } } }`

### Session Lifecycle
- On initial startup, credentials are read from `account.txt` (or the `ACCOUNT_COOKIE` / `ACCOUNT_EMAIL` & `ACCOUNT_PASSWORD` environment variables).
- Successful sessions and refreshed cookies are automatically synchronized to `session.json` and `account.txt`.
- When an Instagram challenge or temporary network drop occurs, the client executes exponential backoff reconnection without terminating the process.

---

## 3. Real-Time MQTT Gateway

- **Gateway URL:** `wss://edge-chat.instagram.com/chat`
- **Protocol:** FB-MQTT (proxygen/thrift MQTT 3.1 over WebSockets with zlib Deflate compression)
- **Topics Subscribed:**
  - `/ig_realtime_sub` (real-time message notifications)
  - `/ig_sub_iris_response` (Iris delta synchronization responses)
  - `/ig_message_sync` (inbox direct sync)

### Protocol Customizations
Standard MQTT strictly enforces `0x0` flags on PUBACK and SUBACK packets. Instagram's custom MQTT backend utilizes these header bits for internal compression and sequence ACK flags. InstaBOT relaxes these non-standard flag checks to ensure reliable long-lived socket sessions.
