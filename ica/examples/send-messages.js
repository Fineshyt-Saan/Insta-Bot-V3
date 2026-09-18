/**
 * @fileoverview NKXICA - Sending Messages
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Covers:
 *   - Plain text messages
 *   - Replies to a specific message
 *   - Direct messages to a user (opens/reuses a DM thread)
 *   - Typing indicators
 *   - Reactions (send + remove)
 *   - Unsending a message
 *   - Marking threads as read / unread
 */

'use strict';

const { login } = require('../index');

async function main() {
  const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';
  const api = await login(cookies, { logLevel: 'info' });

  const THREAD_ID = 'YOUR_THREAD_ID'; // numeric string, e.g. '110123456789012345'
  const USER_ID   = 'TARGET_USER_ID'; // numeric string

  // ── Send a plain text message ───────────────────────────────────────────────
  const sent = await api.sendMessage('Hello from NKXICA!', THREAD_ID);
  console.log('Sent message ID:', sent?.item_id);

  // ── Reply to a specific message ─────────────────────────────────────────────
  const REPLY_TO_ID = 'MESSAGE_ID_TO_REPLY_TO';
  await api.replyToMessage(THREAD_ID, 'This is a reply!', REPLY_TO_ID);

  // ── Send a direct message (creates or reuses a DM thread) ──────────────────
  await api.sendDirectMessage(USER_ID, 'Hey, sent via NKXICA');

  // ── Typing indicators ───────────────────────────────────────────────────────
  // Show "typing…" for 3 seconds then stop
  await api.sendTypingIndicator(THREAD_ID);
  await sleep(3000);
  await api.stopTypingIndicator(THREAD_ID);

  // ── Send a reaction (any single emoji) ─────────────────────────────────────
  const TARGET_MESSAGE_ID = 'MESSAGE_ID_TO_REACT_TO';
  await api.sendReaction('❤️', TARGET_MESSAGE_ID);

  // ── Remove a reaction ───────────────────────────────────────────────────────
  await api.removeReaction(TARGET_MESSAGE_ID);

  // ── Unsend (delete) a message you sent ─────────────────────────────────────
  const MY_MESSAGE_ID = 'YOUR_OWN_MESSAGE_ID';
  await api.unsendMessage(MY_MESSAGE_ID);

  // ── Mark thread as read ─────────────────────────────────────────────────────
  await api.markAsRead(THREAD_ID);

  // ── Mark thread as unread ───────────────────────────────────────────────────
  await api.markAsUnread(THREAD_ID);

  // ── Real-time usage: auto-echo with typing simulation ──────────────────────
  const me = api.getCurrentUserID();

  api.listen((err, event) => {
    if (err) return console.error(err.message);
    if (event.type !== 'message') return;
    if (event.senderID === me.userID) return;

    api.sendTypingIndicator(event.threadID);
    setTimeout(async () => {
      await api.stopTypingIndicator(event.threadID);
      await api.sendMessage(`You said: "${event.body}"`, event.threadID);
      await api.markAsRead(event.threadID);
    }, 1500);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);