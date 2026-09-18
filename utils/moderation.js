const config = require('../config');
const logger = require('./logger');
const database = require('./database');

const spamMap = new Map();

class ModerationManager {
  checkUserWhitelist(userId) {
    if (!config.WHITELIST_ENABLE) return true;
    return config.WHITELIST_IDS.includes(String(userId));
  }

  checkThreadWhitelist(threadId) {
    if (!config.WHITELIST_THREAD_ENABLE) return true;
    return config.WHITELIST_THREAD_IDS.includes(String(threadId));
  }

  checkWhitelist(userId, threadId) {
    const ue = config.WHITELIST_ENABLE, te = config.WHITELIST_THREAD_ENABLE;
    if (!ue && !te) return true;
    if (ue && te) return this.checkUserWhitelist(userId) || this.checkThreadWhitelist(threadId);
    if (ue) return this.checkUserWhitelist(userId);
    if (te) return this.checkThreadWhitelist(threadId);
    return true;
  }

  checkCommandSpam(userId) {
    const uid = String(userId);
    const threshold = config.SPAM_COMMAND_THRESHOLD || 5;
    const window    = (config.SPAM_TIME_WINDOW || 10) * 1000;
    const now = Date.now();
    let entry = spamMap.get(uid);
    if (!entry || now - entry.windowStart > window) {
      spamMap.set(uid, { count: 1, windowStart: now });
      return { isSpam: false };
    }
    entry.count++;
    if (entry.count > threshold) {
      // Rate-limit temporarily, but DO NOT auto-ban the user (only admins can ban)
      return { isSpam: true, shouldBan: false, message: '⏰ Command rate limit reached. Please slow down.' };
    }
    return { isSpam: false };
  }

  resetSpam(userId) { spamMap.delete(String(userId)); }

  async moderateMessage(userId, threadId, messageText) {
    const uid = String(userId), tid = String(threadId);
    if (database.isBanned(uid)) {
      // Silently block banned users without spamming ban messages into GC
      return { allowed: false, reason: 'userBanned', message: null };
    }
    if (!this.checkWhitelist(uid, tid)) {
      return { allowed: false, reason: 'whitelist', message: '⚠️ This bot is in whitelist mode. You are not authorized.' };
    }
    return { allowed: true };
  }

  getStats() {
    return {
      whitelistUserEnabled:   config.WHITELIST_ENABLE,
      whitelistThreadEnabled: config.WHITELIST_THREAD_ENABLE,
      spamThreshold:          config.SPAM_COMMAND_THRESHOLD,
      spamTimeWindow:         config.SPAM_TIME_WINDOW
    };
  }
}

module.exports = new ModerationManager();
