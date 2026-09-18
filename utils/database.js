const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('../config');
const _ = require('lodash');

class Database {
  constructor() {
    this.data = this._default();
    this.dbPath = path.resolve(config.DATABASE_PATH || './storage/data/bot.sqlite');
    this.storeType = 'json';

    // Compatibility properties
    this.allUserData = [];
    this.allThreadData = [];
    this.allGlobalData = [];

    // Wrappers for GoatBot V2 compatibility
    this.usersData = {
      get: async (uid, path, defaultValue) => {
          const u = this.getUser(uid);
          if (path) return _.get(u, path, defaultValue);
          return u;
      },
      set: async (uid, updates, path) => {
          const u = this.getUser(uid);
          if (path) {
              _.set(u, path, updates);
              return this.updateUser(uid, u);
          }
          return this.updateUser(uid, updates);
      },
      getAll: async () => {
          this.allUserData = Object.values(this.data.users);
          return this.allUserData;
      },
      getAvatarUrl: async (uid) => {
          return `https://www.instagram.com/p/avatar/${uid}`;
      },
      getName: async (uid) => {
          if (!uid) return 'User';
          const clean = String(uid).replace(/^@+/, '').trim();
          let u = this.getUser(clean);
          if (!u.name && !u.username) {
            const byUsername = this.getUserByUsername(clean);
            if (byUsername) u = byUsername;
          }
          if (u.name) return u.name;
          if (u.username) return '@' + u.username;
          if (global.GoatBot?.instance?.api) {
            try {
              const info = await global.GoatBot.instance.api.getUserInfo(clean);
              const mapped = info[clean] || info;
              if (mapped.name || mapped.fullName || mapped.username) {
                u.name = mapped.name || mapped.fullName || mapped.username;
                u.username = mapped.username || u.username;
                this.updateUser(u.id || clean, u);
                return u.name;
              }
            } catch (_) {}
          }
          return clean;
      },
      getNameInDB: (uid) => {
          const u = this.data.users[uid];
          return u ? u.name : null;
      },
      getMoney: async (uid) => {
          const e = this.getBalance(uid);
          return e.balance;
      },
      addMoney: async (uid, amt) => {
          return this.addBalance(uid, amt);
      },
      subtractMoney: async (uid, amt) => {
          return this.addBalance(uid, -amt);
      }
    };

    this.threadsData = {
      getName: async (tid) => {
          const t = this.getThreadData(tid);
          return t.name || tid;
      },
      get: async (tid, path, defaultValue) => {
          const t = this.getThreadData(tid);
          if (path) return _.get(t, path, defaultValue);
          return t;
      },
      set: async (tid, updates, path) => {
          const t = this.getThreadData(tid);
          if (path) {
              _.set(t, path, updates);
              return this.setThreadData(tid, t);
          }
          return this.setThreadData(tid, updates);
      },
      getAll: async () => {
          this.allThreadData = Object.values(this.data.threads);
          return this.allThreadData;
      }
    };

    // Bridge for GoatBot V2
    if (!global.client) global.client = {};
    if (!global.client.database) global.client.database = {};
    global.client.database.usersData = this.usersData;
    global.client.database.threadsData = this.threadsData;
    global.client.database.globalData = this.globalData;

    // Bridge for global data
    this.globalData = {
        get: async (key, path, defaultValue) => {
            if (!this.data.global) this.data.global = {};
            if (!this.data.global[key]) this.data.global[key] = defaultValue || { data: {} };
            const res = this.data.global[key];
            if (path) return _.get(res, path, defaultValue);
            return res;
        },
        set: async (key, val, path) => {
            if (!this.data.global) this.data.global = {};
            if (!this.data.global[key]) this.data.global[key] = { data: {} };
            if (path) _.set(this.data.global[key], path, val);
            else this.data.global[key] = val;
            return this.data.global[key];
        }
    };

    this.ready = this.init();
  }

  _default() {
    return {
      users: {}, threads: {}, stats: {}, economy: {}, global: {},
      reminders: [], autoResponses: [],
      welcomedUsers: new Set(), bannedUsers: new Set(),
      spamWarnings: {}, lastMessages: {}, sentMessages: {}, processedMessages: {},
      replyHandlers: {}, reactionHandlers: {},
      autoRemoveMessages: []
    };
  }

  _normalize(d = {}) {
    return {
      users: d.users || {}, threads: d.threads || {}, stats: d.stats || {},
      economy: d.economy || {}, reminders: d.reminders || [], autoResponses: d.autoResponses || [],
      global: d.global || {},
      welcomedUsers: new Set(d.welcomedUsers || []), bannedUsers: new Set(d.bannedUsers || []),
      spamWarnings: d.spamWarnings || {}, lastMessages: d.lastMessages || {},
      sentMessages: d.sentMessages || {}, processedMessages: d.processedMessages || {},
      replyHandlers: d.replyHandlers || {}, reactionHandlers: d.reactionHandlers || {},
      autoRemoveMessages: d.autoRemoveMessages || []
    };
  }

  _serialize() {
    return {
        ...this.data,
        welcomedUsers: [...this.data.welcomedUsers],
        bannedUsers: [...this.data.bannedUsers]
    };
  }

  _ensureDir() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async init() {
    try {
      this._ensureDir();
      const jsonPath = this.dbPath.replace('.sqlite', '.json');
      if (fs.existsSync(jsonPath)) {
        this.data = this._normalize(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
        logger.info('Database loaded from JSON');
      } else {
        this.save();
        logger.info('Created new database');
      }

      this.allUserData = Object.values(this.data.users);
      this.allThreadData = Object.values(this.data.threads);
      this.allGlobalData = Object.values(this.data.global || {});

      if (config.DATABASE_AUTO_SAVE) {
        const saveTimer = setInterval(() => this.save(), config.DATABASE_SAVE_INTERVAL || 60000);
        if (saveTimer.unref) saveTimer.unref();
        logger.info('Auto-save enabled');
      }
    } catch (e) {
      logger.error('Failed to init database', { error: e.message });
      this.data = this._default();
    }
  }

  save() {
    try {
      const jsonPath = this.dbPath.replace('.sqlite', '.json');
      this._ensureDir();
      fs.writeFileSync(jsonPath, JSON.stringify(this._serialize(), null, 2));
      logger.debug('Database saved');
    } catch (e) { logger.error('Failed to save database', { error: e.message }); }
  }

  getUser(uid) {
    if (!this.data.users[uid]) {
      this.data.users[uid] = {
        id: uid,
        userID: uid,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        messageCount: 0,
        commandCount: 0,
        exp: 0,
        level: 1,
        money: 0,
        banned: false,
        data: {}
      };
    }
    return this.data.users[uid];
  }

  getUserByUsername(username) {
    if (!username) return null;
    const clean = String(username).replace(/^@+/, '').trim().toLowerCase();
    for (const uid in this.data.users) {
      const u = this.data.users[uid];
      if (u.username && u.username.toLowerCase() === clean) {
        return u;
      }
    }
    return null;
  }

  updateUser(uid, updates) {
    const u = this.getUser(uid);
    Object.assign(u, updates, { lastSeen: Date.now() });
    this.data.users[uid] = u;
    return u;
  }

  getBalance(uid) {
    if (!this.data.economy[uid]) {
      this.data.economy[uid] = { balance: 1000, bank: 0, lastDaily: 0, lastWork: 0 };
    }
    const u = this.getUser(uid);
    if (u.money !== undefined && u.money !== this.data.economy[uid].balance) {
        this.data.economy[uid].balance = u.money;
    }
    return this.data.economy[uid];
  }

  addBalance(uid, amt) {
    const e = this.getBalance(uid);
    e.balance += amt;
    this.data.economy[uid] = e;
    this.updateUser(uid, { money: e.balance });
    return e.balance;
  }

  incrementStat(key) { this.data.stats[key] = (this.data.stats[key] || 0) + 1; }
  getStat(key)       { return this.data.stats[key] || 0; }

  hasBeenWelcomed(uid) { return this.data.welcomedUsers.has(uid); }
  markAsWelcomed(uid)  { this.data.welcomedUsers.add(uid); }

  isBanned(uid) { return this.data.bannedUsers.has(String(uid)); }
  banUser(uid)  { this.data.bannedUsers.add(String(uid)); logger.info(`User ${uid} banned`); }
  unbanUser(uid){ this.data.bannedUsers.delete(String(uid)); logger.info(`User ${uid} unbanned`); }

  getThreadData(tid) {
    if (!this.data.threads[tid]) {
      this.data.threads[tid] = {
        id: tid,
        threadID: tid,
        prefix: null,
        settings: {},
        data: {},
        createdAt: Date.now()
      };
    }
    return this.data.threads[tid];
  }

  setThreadData(tid, data) {
    const t = this.getThreadData(tid);
    Object.assign(t, data);
    this.data.threads[tid] = t;
    return t;
  }

  deleteThreadData(tid) {
    if (this.data.threads[tid]) { delete this.data.threads[tid]; return true; }
    return false;
  }

  addAutoResponse(trigger, response, createdBy) {
    const ar = { id: Date.now().toString(), trigger, response, createdBy, createdAt: Date.now() };
    this.data.autoResponses.push(ar);
    return ar;
  }

  removeAutoResponse(id) {
    const i = this.data.autoResponses.findIndex(a => a.id === id);
    if (i > -1) { this.data.autoResponses.splice(i, 1); return true; }
    return false;
  }

  getAutoResponses() { return this.data.autoResponses; }

  findAutoResponse(msg) {
    return this.data.autoResponses.find(a => msg.toLowerCase().includes(a.trigger.toLowerCase()));
  }

  addReminder(userId, message, triggerTime) {
    const r = { id: Date.now().toString(), userId, message, triggerTime, createdAt: Date.now() };
    this.data.reminders.push(r);
    return r;
  }

  getDueReminders() { return this.data.reminders.filter(r => r.triggerTime <= Date.now()); }

  removeReminder(id) {
    const i = this.data.reminders.findIndex(r => r.id === id);
    if (i > -1) { this.data.reminders.splice(i, 1); return true; }
    return false;
  }

  getAllUsers() { return Object.values(this.data.users); }
  getAllStats() { return this.data.stats; }

  storeSentMessage(threadId, itemId) {
    if (!this.data.sentMessages[threadId]) this.data.sentMessages[threadId] = [];
    this.data.sentMessages[threadId].push({ itemId, timestamp: Date.now() });
    if (this.data.sentMessages[threadId].length > 50) this.data.sentMessages[threadId].shift();
  }

  getLastSentMessage(threadId) {
    const msgs = this.data.sentMessages[threadId];
    if (!msgs || !msgs.length) return null;
    const last = msgs[msgs.length - 1];
    return { itemId: last.itemId, threadId, timestamp: last.timestamp };
  }

  removeSentMessage(threadId, itemId) {
    if (!this.data.sentMessages[threadId]) return false;
    const i = this.data.sentMessages[threadId].findIndex(m => m.itemId === itemId);
    if (i > -1) { this.data.sentMessages[threadId].splice(i, 1); return true; }
    return false;
  }

  getAllSentMessages(threadId) { return this.data.sentMessages[threadId] || []; }

  isMessageProcessed(msgId) { return this.data.processedMessages[msgId] !== undefined; }

  markMessageAsProcessed(msgId) {
    this.data.processedMessages[msgId] = Date.now();
    const keys = Object.keys(this.data.processedMessages);
    if (keys.length > 1000) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      keys.forEach(k => { if (this.data.processedMessages[k] < cutoff) delete this.data.processedMessages[k]; });
    }
  }

  trackMessage(uid) {
    const now = Date.now();
    if (!this.data.lastMessages[uid]) this.data.lastMessages[uid] = [];
    this.data.lastMessages[uid].push(now);
    const cutoff = now - 60000;
    this.data.lastMessages[uid] = this.data.lastMessages[uid].filter(t => t > cutoff);
    return this.data.lastMessages[uid].length;
  }

  addSpamWarning(uid) {
    if (!this.data.spamWarnings[uid]) this.data.spamWarnings[uid] = { count: 0, lastWarning: 0 };
    this.data.spamWarnings[uid].count++;
    this.data.spamWarnings[uid].lastWarning = Date.now();
    return this.data.spamWarnings[uid].count;
  }

  setReplyData(messageID, data) {
    this.data.replyHandlers[String(messageID)] = { ...data, timestamp: Date.now() };
    if (!global.GoatBot.onReply) global.GoatBot.onReply = new Map();
    global.GoatBot.onReply.set(String(messageID), data);
  }

  getReplyData(messageID) {
    return this.data.replyHandlers[String(messageID)] || null;
  }

  setReactionData(messageID, data) {
    this.data.reactionHandlers[String(messageID)] = { ...data, timestamp: Date.now() };
    if (!global.GoatBot.onReaction) global.GoatBot.onReaction = new Map();
    global.GoatBot.onReaction.set(String(messageID), data);
  }

  getReactionData(messageID) {
    return this.data.reactionHandlers[String(messageID)] || null;
  }

  addAutoRemoveMessage(threadId, messageId, delayMs) {
    const triggerTime = Date.now() + delayMs;
    this.data.autoRemoveMessages.push({ threadId, messageId, triggerTime });
  }

  getExpiredAutoRemoveMessages() {
    const now = Date.now();
    const expired = this.data.autoRemoveMessages.filter(m => m.triggerTime <= now);
    this.data.autoRemoveMessages = this.data.autoRemoveMessages.filter(m => m.triggerTime > now);
    return expired;
  }

  storeChatHistory(senderID, threadID, text, role = 'user') {
    if (!this.data.chatHistory) this.data.chatHistory = {};
    const key = `${threadID}_${senderID}`;
    if (!this.data.chatHistory[key]) this.data.chatHistory[key] = [];
    this.data.chatHistory[key].push({ role, text, timestamp: Date.now() });
    if (this.data.chatHistory[key].length > 30) {
      this.data.chatHistory[key].shift();
    }
  }

  getChatHistory(senderID, threadID) {
    if (!this.data.chatHistory) return [];
    const key = `${threadID}_${senderID}`;
    return this.data.chatHistory[key] || [];
  }

  learnPhrasePair(ask, reply, senderID) {
    if (!this.data.learnedPairs) this.data.learnedPairs = [];
    const cleanAsk = String(ask).toLowerCase().trim();
    const cleanReply = String(reply).toLowerCase().trim();
    if (!cleanAsk || !cleanReply || cleanAsk === cleanReply) return;
    const existing = this.data.learnedPairs.find(p => p.ask === cleanAsk && p.reply === reply);
    if (!existing) {
      this.data.learnedPairs.push({ ask: cleanAsk, reply, senderID, timestamp: Date.now() });
      if (this.data.learnedPairs.length > 2000) this.data.learnedPairs.shift();
    }
  }

  findLearnedPair(text) {
    if (!this.data.learnedPairs || this.data.learnedPairs.length === 0) return null;
    const cleanText = String(text).toLowerCase().trim();
    if (!cleanText) return null;

    // 1. Exact match
    const exact = this.data.learnedPairs.find(p => p.ask === cleanText);
    if (exact && exact.reply.toLowerCase().trim() !== cleanText) return exact.reply;

    // 2. Fuzzy / Keyword match
    const words = cleanText.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const match = this.data.learnedPairs.find(p => {
        const askLower = p.ask.toLowerCase();
        if (askLower === cleanText || askLower.trim() === cleanText) return false;
        const matchCount = words.filter(w => askLower.includes(w)).length;
        return (matchCount >= Math.ceil(words.length * 0.5)) && (p.reply.toLowerCase().trim() !== cleanText);
      });
      if (match) return match.reply;
    }

    return null;
  }

  getRandomLearnedReply() {
    if (!this.data.learnedPairs || this.data.learnedPairs.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * this.data.learnedPairs.length);
    return this.data.learnedPairs[randomIndex]?.reply || null;
  }
}

module.exports = new Database();
