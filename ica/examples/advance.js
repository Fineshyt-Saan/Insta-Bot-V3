/**
 * @fileoverview NKXICA - Advanced Usage
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Covers:
 *   - All client options
 *   - All MQTT event types
 *   - Proxy support
 *   - Stories (get, react, reply)
 *   - Live (feed, comment, heart)
 *   - Task scheduler (cron)
 *   - SQLite message database
 *   - Error handling and graceful shutdown
 *   - Multi-account setup (separate client instances)
 */

'use strict';

const { login } = require('../index');

const COOKIES = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';

// ── All available options ─────────────────────────────────────────────────────
//
// Pass any of these as the second argument to login():
//
//   const api = await login(cookies, {
//     logLevel: 'info',
//     selfListen: false,
//     listenEvents: true,
//     autoMarkRead: false,
//     autoMarkDelivery: true,
//     proxy: null,
//     userAgent: null,
//     timeout: 30000,
//     autoReconnect: true,
//     maxRetries: 3,
//     rateLimitDelay: 1000,
//     database: false,
//     dbOptions: { storage: './nkxica.db', logging: false },
//     scheduler: false,
//     deviceId: null,
//     phoneId: null,
//     uuid: null,
//     advertisingId: null
//   });

// ── Full event reference ──────────────────────────────────────────────────────

async function eventDemo() {
  const api = await login(COOKIES, { logLevel: 'info', listenEvents: true });

  api.listen((err, event) => {
    if (err) return console.error('Listen error:', err.message);

    switch (event.type) {
      case 'message':
        console.log('Message from', event.senderID, 'in', event.threadID);
        console.log('  body:', event.body);
        console.log('  attachments:', event.attachments.length);
        console.log('  isGroup:', event.isGroup);
        console.log('  replyTo:', event.replyTo);
        break;

      case 'message_reaction':
        console.log('Reaction', event.reaction, 'by', event.senderID, 'on', event.messageID);
        break;

      case 'read_receipt':
        console.log('Read receipt in', event.threadID, 'at', event.messageID);
        break;

      case 'typing':
        console.log(event.senderID, event.isTyping ? 'started' : 'stopped', 'typing in', event.threadID);
        break;

      case 'story_share':
        console.log('Story share from', event.senderID, '— story id:', event.storyId);
        break;

      case 'voice':
        console.log('Voice message from', event.senderID, '— duration:', event.attachments[0]?.duration, 'ms');
        break;

      default:
        console.log('Unknown event type:', event.type);
    }
  });

  api.on('connected',    ({ method }) => console.log('Connected via', method));
  api.on('disconnected', ()           => console.log('Disconnected'));
  api.on('reconnecting', ()           => console.log('Reconnecting...'));
  api.on('error',        (err)        => console.error('Client error:', err.message));

  return api;
}

// ── Proxy support ─────────────────────────────────────────────────────────────

async function proxyDemo() {
  const api = await login(COOKIES, {
    logLevel: 'info',
    proxy: 'http://username:password@proxy-host:8080'
  });
  console.log('Connected through proxy');
}

// ── Stories ───────────────────────────────────────────────────────────────────

async function storiesDemo() {
  const api = await login(COOKIES, { logLevel: 'info' });

  const USER_ID = 'TARGET_USER_ID';
  const stories = await api.getUserStories(USER_ID);
  console.log(`${USER_ID} has ${stories.length} active stories`);

  if (stories.length > 0) {
    const storyId = stories[0].id;
    await api.reactToStory(storyId, USER_ID, '🔥');
    console.log('Reacted to story');
    await api.replyToStory(storyId, USER_ID, 'Great story!');
    console.log('Replied to story');
  }

  const feed = await api.getFeedStories({ limit: 10 });
  console.log('Feed stories from', feed.length, 'accounts');
}

// ── Live ──────────────────────────────────────────────────────────────────────

async function liveDemo() {
  const api = await login(COOKIES, { logLevel: 'info' });

  const BROADCAST_ID = 'LIVE_BROADCAST_ID';
  const feed = await api.getLiveFeed({ limit: 5 });
  console.log('Live broadcasts:', feed.length);

  await api.sendLiveComment(BROADCAST_ID, 'Hello from NKXICA!');
  await api.sendLiveHeart(BROADCAST_ID, 5);
}

// ── Task scheduler (cron) ─────────────────────────────────────────────────────

async function schedulerDemo() {
  const api = await login(COOKIES, { logLevel: 'info', scheduler: true });

  const THREAD_ID = 'YOUR_THREAD_ID';

  api.scheduleTask('morning-greeting', '0 9 * * *', async () => {
    await api.sendMessage('Good morning!', THREAD_ID);
    console.log('Morning greeting sent');
  });

  api.scheduleTask('weekly-reminder', '0 8 * * 1', async () => {
    await api.sendMessage('Weekly check-in time!', THREAD_ID);
  });
}

// ── SQLite database ───────────────────────────────────────────────────────────

async function databaseDemo() {
  const api = await login(COOKIES, {
    logLevel: 'info',
    database: true,
    dbOptions: { storage: './messages.db' }
  });

  await api.initDatabase();

  const THREAD_ID = 'YOUR_THREAD_ID';

  api.listen((err, event) => {
    if (err) return;
    // Events are persisted to SQLite automatically
  });

  const local = await api._client.getMessagesFromDB(THREAD_ID, { limit: 50 });
  console.log(`DB has ${local.length} messages for thread ${THREAD_ID}`);
}

// ── Multi-account ─────────────────────────────────────────────────────────────

async function multiAccountDemo() {
  const [api1, api2] = await Promise.all([
    login('sessionid=ACCOUNT_1_SESSION; ds_user_id=UID1; csrftoken=CSRF1; ig_did=DID1', { logLevel: 'warn' }),
    login('sessionid=ACCOUNT_2_SESSION; ds_user_id=UID2; csrftoken=CSRF2; ig_did=DID2', { logLevel: 'warn' })
  ]);

  console.log('Account 1:', api1.getCurrentUserID().username);
  console.log('Account 2:', api2.getCurrentUserID().username);

  api1.listen((err, event) => {
    if (err || event.type !== 'message') return;
    console.log('[account1]', event.senderID, ':', event.body);
  });

  api2.listen((err, event) => {
    if (err || event.type !== 'message') return;
    console.log('[account2]', event.senderID, ':', event.body);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function setupShutdown(api) {
  async function shutdown(signal) {
    console.log(`\n${signal} received — shutting down`);
    api.stopListening();
    await api.logout();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const api = await eventDemo();
  setupShutdown(api);
}

main().catch(console.error);