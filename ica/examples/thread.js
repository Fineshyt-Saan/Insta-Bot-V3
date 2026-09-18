/**
 * @fileoverview NKXICA - Thread Management
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Covers:
 *   - Fetching the inbox (DM list)
 *   - Pending / message requests
 *   - Thread info
 *   - Message history (with pagination)
 *   - Searching threads
 *   - Thread management: delete, mute, unmute, approve/decline requests,
 *     change title, change nickname, add users, leave group
 */

'use strict';

const { login } = require('../index');

async function main() {
  const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';
  const api = await login(cookies, { logLevel: 'info' });

  const THREAD_ID = 'YOUR_THREAD_ID';
  const USER_ID   = 'TARGET_USER_ID';

  // ── Inbox ───────────────────────────────────────────────────────────────────
  const inbox = await api.getInbox({ limit: 20 });
  console.log(`Inbox: ${inbox.threads.length} threads`);
  for (const thread of inbox.threads) {
    const preview = thread.lastMessage?.body || '(media)';
    console.log(`  [${thread.threadID}] ${thread.name} — "${preview}"`);
  }

  // ── Pending message requests ────────────────────────────────────────────────
  const client = api._client;
  const pending = await client.getPendingRequests({ limit: 10 });
  console.log(`Pending requests: ${pending.threads?.length ?? 0}`);

  // Approve or decline each pending request
  for (const thread of pending.threads || []) {
    // await client.approveRequest(thread.threadID);
    // await client.declineRequest(thread.threadID);
  }

  // ── Thread info ─────────────────────────────────────────────────────────────
  const info = await api.getThreadInfo(THREAD_ID);
  console.log('Thread name:', info.name);
  console.log('Is group:', info.isGroup);
  console.log('Participants:', info.participants.map(p => p.username).join(', '));

  // ── Message history ─────────────────────────────────────────────────────────
  const messages = await api.getThreadHistory(THREAD_ID, 30);
  console.log(`Fetched ${messages.length} messages`);
  for (const msg of messages) {
    console.log(`  [${msg.messageID}] ${msg.senderID}: ${msg.body || '(attachment)'}`);
  }

  // Paginate older messages using a cursor timestamp
  const oldest = messages[messages.length - 1];
  if (oldest) {
    const older = await api.getThreadHistory(THREAD_ID, 30, oldest.timestamp);
    console.log(`Got ${older.length} older messages`);
  }

  // ── Search threads ──────────────────────────────────────────────────────────
  const results = await client.searchThreads('alice');
  console.log('Search results:', results.map(t => t.name).join(', '));

  // ── Mute / unmute ───────────────────────────────────────────────────────────
  await client.muteThread(THREAD_ID);
  console.log('Muted');
  await client.unmuteThread(THREAD_ID);
  console.log('Unmuted');

  // ── Change group title ──────────────────────────────────────────────────────
  await client.changeThreadTitle(THREAD_ID, 'My Group Name');
  console.log('Title updated');

  // ── Change a participant nickname ───────────────────────────────────────────
  await client.changeNickname(USER_ID, THREAD_ID, 'CoolNick');
  console.log('Nickname updated');

  // ── Add users to a group ────────────────────────────────────────────────────
  const NEW_USER_IDS = ['USER_ID_1', 'USER_ID_2'];
  await client.threadManagement.addUsers(THREAD_ID, NEW_USER_IDS);
  console.log('Users added');

  // ── Leave a group ───────────────────────────────────────────────────────────
  // await client.threadManagement.leave(THREAD_ID);

  // ── Delete (hide) a thread ──────────────────────────────────────────────────
  // await api.deleteThread(THREAD_ID);
}

main().catch(console.error);