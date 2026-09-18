'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');

// Global test setup
global.utils = require('../utils.js');
global.GoatBot = global.GoatBot || {};
global.GoatBot.config = require('../config');
global.client = global.client || {};

const Bot = require('../core/bot');
const { getPermissionLevel, checkPermission } = require('../core/permissions/permissions');
const { normalizeEvent } = require('../platforms/instagram/events/normalizer');
const { createAPIWrapper } = require('../platforms/instagram/adapter/apiWrapper');
const { createMessageContext } = require('../platforms/instagram/adapter/messageContext');
const { handleOutgoingMedia } = require('../platforms/instagram/media/handler');
const CookieUtils = require('../ica/src/utils/cookies');

async function runSuite() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        InstaBOT Complete Verification Test Suite          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  ▶ ${name} ... `);
    try {
      await fn();
      console.log('✔ PASS');
      passed++;
    } catch (err) {
      console.log('✖ FAIL');
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      }
      failed++;
    }
  }

  // ── 1. Permissions & Roles ──
  await test('Permissions Hierarchy (User, Thread Admin, Bot Admin, Owner)', async () => {
    const config = {
      ADMIN_BOT: ['99901'],
      DEV_USERS: ['99902']
    };
    const threadAdmins = ['11101'];

    assert.strictEqual(getPermissionLevel('12345', threadAdmins, config), 0, 'Regular user should be 0');
    assert.strictEqual(getPermissionLevel('11101', threadAdmins, config), 1, 'Thread admin should be 1');
    assert.strictEqual(getPermissionLevel('99901', threadAdmins, config), 2, 'Bot admin should be 2');
    assert.strictEqual(getPermissionLevel('99902', threadAdmins, config), 3, 'Bot owner should be 3');

    assert.strictEqual(checkPermission(0, 0), true);
    assert.strictEqual(checkPermission(0, 1), false);
    assert.strictEqual(checkPermission(2, 1), true);
    assert.strictEqual(checkPermission(3, 2), true);
  });

  // ── 2. Command and Event Loaders ──
  await test('CommandLoader & EventLoader Discovery', async () => {
    const bot = new Bot();
    await bot.commandLoader.loadCommands();
    await bot.eventLoader.loadEvents();

    assert(bot.commandLoader.commands.size >= 50, `Expected >= 50 commands, got ${bot.commandLoader.commands.size}`);
    assert(bot.commandLoader.aliases.size >= 100, `Expected >= 100 aliases, got ${bot.commandLoader.aliases.size}`);
    assert(bot.eventLoader.events.size >= 4, `Expected >= 4 events, got ${bot.eventLoader.events.size}`);

    // Verify key commands exist
    assert(bot.commandLoader.get('ping'), 'ping command missing');
    assert(bot.commandLoader.get('help'), 'help command missing');
    assert(bot.commandLoader.get('uptime'), 'uptime command missing');
    assert(bot.commandLoader.get('effect'), 'effect command missing');
    assert(bot.commandLoader.get('stats'), 'stats command missing');
    assert(bot.commandLoader.get('theme'), 'theme fallback missing');
  });

  // ── 3. Instagram Event Normalizer ──
  await test('Event Normalizer (Raw MQTT -> Floppa Unified Event)', async () => {
    const rawMessage = {
      message: {
        item_id: 'item_12345',
        timestamp: Date.now() * 1000,
        user_id: 'user_456',
        text: '!ping hello',
        item_type: 'text'
      },
      thread_id: 'thread_789'
    };

    const norm = normalizeEvent(rawMessage, 'user_bot');
    assert.strictEqual(norm.type, 'message');
    assert.strictEqual(norm.threadID, 'thread_789');
    assert.strictEqual(norm.senderID, 'user_456');
    assert.strictEqual(norm.messageID, 'item_12345');
    assert.strictEqual(norm.body, '!ping hello');
    assert.strictEqual(norm.isSelf, false);
  });

  // ── 4. Media Caption Separation ──
  await test('Media Handler Caption Separation for Instagram Video Direct', async () => {
    const mockSent = [];
    const mockApi = {
      sendMessage: (msg, tid) => {
        mockSent.push({ msg, tid });
        return Promise.resolve({ messageID: 'msg_' + mockSent.length });
      },
      sendVideo: (tid, url) => {
        mockSent.push({ video: url, tid });
        return Promise.resolve({ messageID: 'vid_1' });
      }
    };

    const dummyVideo = path.join(process.cwd(), 'temp', 'test_video.mp4');
    await fs.ensureDir(path.dirname(dummyVideo));
    await fs.writeFile(dummyVideo, 'fake-video-content');

    // Caption should be sent as separate message because Instagram drops video captions
    await handleOutgoingMedia({
      body: 'Check out this video caption',
      attachment: dummyVideo
    }, 'thread_999', mockApi);

    await fs.unlink(dummyVideo).catch(() => {});

    assert(mockSent.length >= 2, 'Should send media and caption separately');
    const textEntry = mockSent.find(s => s.msg && s.msg.includes('Check out this video caption'));
    assert(textEntry, 'Separate caption entry must exist');
  });

  // ── 5. MessageContext Helpers & API Wrapper ──
  await test('MessageContext Helpers & Direct Instagram Power-ups', async () => {
    const sentItems = [];
    const mockRawApi = {
      sendMessage: {
        toThread: (tid, msg, cb) => {
          sentItems.push({ method: 'sendMessage', tid, msg });
          if (cb) cb(null, { messageID: 'mid_1' });
          return Promise.resolve({ messageID: 'mid_1' });
        }
      },
      replyToMessage: (tid, msg, replyTo, cb) => {
        sentItems.push({ method: 'replyToMessage', tid, msg, replyTo });
        if (cb) cb(null, { messageID: 'mid_2' });
        return Promise.resolve({ messageID: 'mid_2' });
      },
      sendReaction: (reaction, mid, cb) => {
        sentItems.push({ method: 'sendReaction', reaction, mid });
        if (typeof cb === 'function') cb(null, { success: true });
        return Promise.resolve({ success: true });
      },
      unsendMessage: (mid, cb) => {
        sentItems.push({ method: 'unsendMessage', mid });
        if (typeof cb === 'function') cb(null, { success: true });
        return Promise.resolve({ success: true });
      }
    };

    const api = createAPIWrapper(mockRawApi, {});
    const mockEvent = { threadID: 'th_1', messageID: 'msg_orig_1', senderID: 'usr_1' };
    const ctx = createMessageContext(api, mockEvent, {});

    await ctx.reply('Replying back!');
    assert(sentItems.some(s => s.method === 'replyToMessage' && s.msg === 'Replying back!'));

    await ctx.react('❤️');
    assert(sentItems.some(s => s.method === 'sendReaction' && s.reaction === '❤️'));

    await ctx.unsend('mid_2');
    assert(sentItems.some(s => s.method === 'unsendMessage' && s.mid === 'mid_2'));
  });

  // ── 6. Dispatcher Execution Pipeline ──
  await test('Dispatcher onStart & Interactive onReply Handling', async () => {
    const bot = new Bot();
    await bot.commandLoader.loadCommands();

    const replies = [];
    bot.client.rawApi = {
      sendMessage: {
        toThread: (tid, text, cb) => {
          replies.push({ tid, text });
          const res = { messageID: 'bot_msg_' + replies.length };
          if (cb) cb(null, res);
          return Promise.resolve(res);
        }
      },
      replyToMessage: (tid, text, replyTo, cb) => {
        replies.push({ tid, text, replyTo });
        const res = { messageID: 'bot_reply_' + replies.length };
        if (cb) cb(null, res);
        return Promise.resolve(res);
      }
    };
    bot.api = createAPIWrapper(bot.client.rawApi, bot.config);

    // 1. Dispatch *ping
    await bot.dispatcher.dispatch({
      type: 'message',
      threadID: 'test_thread',
      senderID: 'user_123',
      messageID: 'msg_ping',
      body: '*ping',
      args: [],
      attachments: []
    });

    assert(replies.length > 0, 'Bot should have responded to *ping');
    assert(replies.some(r => ((r && (r.text || r.body)) || '').toLowerCase().includes('pong') || ((r && (r.text || r.body)) || '').toLowerCase().includes('ping')), `Response should contain ping/pong`);

    // 2. Dispatch *help to trigger interactive onReply registration
    replies.length = 0;
    await bot.dispatcher.dispatch({
      type: 'message',
      threadID: 'test_thread',
      senderID: 'user_123',
      messageID: 'msg_help',
      body: '*help',
      args: [],
      attachments: []
    });

    const extractText = (r) => {
      if (!r) return '';
      if (typeof r.text === 'string') return r.text;
      if (r.text && typeof r.text === 'object') return r.text.body || JSON.stringify(r.text);
      if (typeof r.msg === 'string') return r.msg;
      if (r.msg && typeof r.msg === 'object') return r.msg.body || JSON.stringify(r.msg);
      return String(r.body || '');
    };

    assert(replies.length > 0, 'Bot should have responded to !help');
    assert(extractText(replies[0]).includes('INSTABOT') || extractText(replies[0]).includes('MENU'), 'Help menu title expected');

    // 3. Trigger onReply navigation
    const helpMsgID = replies[0].messageID || 'bot_reply_1';
    replies.length = 0;

    await bot.dispatcher.dispatch({
      type: 'message_reply',
      threadID: 'test_thread',
      senderID: 'user_123',
      messageID: 'msg_reply_help',
      body: 'ping',
      messageReply: {
        messageID: helpMsgID
      }
    });

    assert(replies.length > 0, 'onReply should have processed command lookup');
    assert(extractText(replies[0]).includes('COMMAND') || extractText(replies[0]).toLowerCase().includes('ping'), 'Help detail expected for ping');
  });

  // ── 7. Graceful Facebook Fallbacks ──
  await test('Graceful Fallback on Facebook-only features (e.g. !theme)', async () => {
    const bot = new Bot();
    await bot.commandLoader.loadCommands();

    const replies = [];
    bot.api = {
      sendMessage: (form, tid) => {
        replies.push(form);
        return Promise.resolve({ messageID: 'm1' });
      },
      replyToMessage: (tid, msg, rid) => {
        replies.push(msg);
        return Promise.resolve({ messageID: 'm2' });
      }
    };

    await bot.dispatcher.dispatch({
      type: 'message',
      threadID: 'test_thread',
      senderID: 'user_123',
      messageID: 'msg_theme',
      body: '*theme blue',
      args: ['blue'],
      attachments: []
    });

    assert(replies.length > 0, 'Bot should reply to *theme');
    const msg = typeof replies[0] === 'string' ? replies[0] : replies[0].body;
    assert(msg.includes('not supported') || msg.includes('Instagram Direct'), `Expected friendly notice, got: ${msg}`);
  });

  // ── 8. Cookie & Account Session Resilience ──
  await test('Tough-Cookie Deserialization & Protocol Compatibility', async () => {
    const accountPath = path.resolve('./account.txt');
    if (fs.existsSync(accountPath)) {
      const data = fs.readFileSync(accountPath, 'utf-8');
      const jar = CookieUtils.parse(data);
      const cookies = jar.serializeSync().cookies;
      assert(cookies.length >= 5, `Expected >= 5 cookies in account.txt, found ${cookies.length}`);
      assert(cookies.some(c => c.key === 'sessionid'), 'account.txt must contain sessionid');
    }
  });

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log('───────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
