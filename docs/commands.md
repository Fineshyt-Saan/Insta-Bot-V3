# Command System & Lifecycle Guide

## 1. Anatomy of a Command

Commands in InstaBOT follow the **Floppa / GoatBot V2 standard architecture**:

```javascript
module.exports = {
  config: {
    name: "ping",
    aliases: ["latency", "p"],
    version: "1.0.0",
    author: "frnAlt",
    countDown: 5,        // Cooldown in seconds
    role: 0,             // 0: All Users, 1: Thread Admin, 2: Bot Admin, 3: Bot Owner
    shortDescription: { en: "Test bot latency" },
    longDescription: { en: "Calculates bot roundtrip response time." },
    category: "system",
    guide: { en: "{pn}" }
  },

  // Invoked when command is dispatched
  onStart: async function ({ message, args, event, api, prefix, usersData, threadsData }) {
    await message.reply("Pong!");
  },

  // Optional: Invoked when a user replies to a message sent by this command
  onReply: async function ({ message, event, Reply, args, api }) {
    // Handle interactive multi-turn conversations
  },

  // Optional: Invoked when a user reacts to a message sent by this command
  onReaction: async function ({ message, event, Reaction, api }) {
    // Handle emoji reaction button clicks
  },

  // Optional: Invoked once during bot boot when API is active
  onLoad: async function ({ api, bot, database }) {
    // Initialize external assets or schemas
  }
};
```

---

## 2. Parameter Reference for `onStart`

| Property | Type | Description |
| :--- | :--- | :--- |
| `message` | `Object` | High-level message context helper (`send`, `reply`, `react`, `effect`, `avatarEffect`, `music`, `unsend`, `typing`). |
| `args` | `Array<string>` | Normalized array of command argument tokens. |
| `event` | `Object` | Normalized incoming event (`threadID`, `senderID`, `messageID`, `body`, `attachments`). |
| `api` | `Object` | Platform API wrapper (`sendMessage`, `replyToMessage`, `sendPhoto`, etc.). |
| `prefix` | `string` | The active prefix for the current thread (`!`, `/`, or custom). |
| `usersData` | `Object` | Database controller for querying and updating user state. |
| `threadsData` | `Object` | Database controller for querying and updating thread state. |
| `bot` | `Bot` | Central bot instance. |

---

## 3. Interactive `onReply` & `onReaction` Navigation

When a command sends a message that requires a response (such as confirmation dialogs, paginated menus, or games like Tic-Tac-Toe / Hangman), it registers its context:

```javascript
const sent = await message.reply("Reply with your choice (1-5):");
global.GoatBot.onReply.set(sent.messageID, {
  commandName: "mycommand",
  author: event.senderID,
  options: [ ... ]
});
```

When the user replies to `sent.messageID`, the dispatcher automatically resolves the state and passes `Reply` into `onReply({ message, event, Reply })`. State entries automatically expire after 30 minutes via `TTLMap`.
