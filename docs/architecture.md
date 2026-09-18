# InstaBOT Architecture & System Design

## 1. Overview

InstaBOT brings the full power, modular architecture, command ecosystem, and interactive capabilities of **Floppa-Chatbot / GoatBot V2** to **Instagram Direct**.

Instead of coupling the bot core to Facebook's FCA/MQTT protocol, InstaBOT cleanly decouples bot business logic from the communication layer:

```
                FLOPPA / GOATBOT CORE
                         |
      +------------------+------------------+
      |                  |                  |
  Commands             Events            Services
(142 modules)       (7 handlers)      (Domain logic)
      |                  |                  |
      +------------------+------------------+
                         |
             CENTRAL EVENT DISPATCHER
      (Prefix, Cooldowns, Roles, Anti-Spam)
                         |
              PLATFORM ADAPTER LAYER
    (Normalizer, Media Pipeline, API Wrapper)
                         |
              NATIVE INSTAGRAM ICA
           (Direct MQTT / REST / Iris)
                         |
                 INSTAGRAM DIRECT
```

---

## 2. Core Subsystems

### A. Central Dispatcher (`core/dispatcher.js`)
- **Deduplication:** Uses sliding TTL window to prevent handling duplicate MQTT packets.
- **Whitelist Mode:** Restricts usage to designated threads and users when active.
- **Spam Flood Protection:** Employs exponential token bucket throttling (`func/spamTracker.js`).
- **Prefix & No-Prefix Resolution:** Handles both custom per-thread prefixes (`!`, `/`, custom) and prefixless conversational commands.
- **Role & Permission Guard:** Enforces 4-tier role hierarchy (Member, Thread Admin, Bot Admin, Bot Owner).
- **Cooldown Manager:** Per-command and per-user execution throttling (`func/cooldownManager.js`).
- **Interactive State Handlers:** Manages `onReply` and `onReaction` callbacks with 30-minute auto-expiring TTL maps.
- **Error Boundaries:** Catches runtime exceptions and reports user-friendly notices without crashing the process.

### B. Command Loader (`core/commandLoader.js`)
- Discovers and validates all command files inside `commands/`.
- Indexes primary names and aliases (over 275 aliases supported).
- Supports both Floppa V2 signatures (`onStart({ message, args, event, api, ... })`) and legacy signatures (`run({ message, args, event, api, ... })`).
- Supports hot-reloading individual commands in memory without stopping the bot.

### C. Event Normalizer (`platforms/instagram/events/normalizer.js`)
- Transforms raw Instagram MQTT / Iris packets into unified Floppa event schemas:
  ```javascript
  {
    threadID,
    senderID,
    messageID,
    body,
    attachments,
    mentions,
    timestamp,
    type,
    isGroup,
    isSelf,
    messageReply,
    replyToItemId,
    raw
  }
  ```
- Advanced commands can still inspect the underlying `.raw` payload when needed.

### D. Instagram Media Pipeline (`platforms/instagram/media/handler.js`)
- **Type Detection:** Identifies images (JPG, PNG), video (MP4), audio/voice notes (MP3, M4A, OGG), and buffers.
- **Caption Separation:** Instagram Direct silently drops text captions attached to video broadcasts. The media handler automatically detects videos and voice notes with text bodies, sending the text as a preamble or reply before broadcasting the media stream.
- **Automatic Lifecycle:** Manages unique temporary files, validates sizes, and enforces cleanup after successful sends or failures.

### E. Platform API Wrapper (`platforms/instagram/adapter/apiWrapper.js`)
- Provides a standard messaging and thread management interface for commands:
  - `sendMessage(form, threadID, callback, replyToMessageID)`
  - `replyToMessage(threadID, text, replyToMessageID, callback)`
  - `unsendMessage(messageID, callback)`
  - `sendReaction(emoji, messageID, callback)`
  - `sendTextEffect(text, threadID, effect)`
  - `sendAvatarTextEffect(text, threadID, effect)`
  - `sendMusic(threadID, track)`
  - `musicSearch(query)`
  - `sendTypingIndicator(threadID)`
  - `getThreadInfo(threadID)`
  - `getUserInfo(userID)`
- Employs safe, non-crashing fallbacks for unsupported Facebook-only methods (e.g. `changeThreadColor`, `getFriendsList`, `getFbstate`).
