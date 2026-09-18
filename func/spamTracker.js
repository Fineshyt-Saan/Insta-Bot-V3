/**
 * Optimized Spam Tracker with TTL and Memory-efficient data structures
 */

class SpamTracker {
  constructor(options = {}) {
    this.options = {
      commandThreshold: options.commandThreshold || 8,
      timeWindow: options.timeWindow || 10000, // 10 seconds in ms
      banDuration: options.banDuration || 60 * 60 * 1000, // 1 hour
      maxEntries: options.maxEntries || 1000,
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
      ...options
    };

    this.threadActivity = new Map();
    this.bannedThreads = new Map();

    this.stats = {
      violations: 0,
      bans: 0,
      unbans: 0,
      cleanups: 0
    };

    this.cleanupTimer = setInterval(() => this._cleanup(), this.options.cleanupInterval);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  trackCommand(threadID, commandName) {
    const now = Date.now();
    const bannedUntil = this.bannedThreads.get(threadID);
    if (bannedUntil && now < bannedUntil) {
      return { isBanned: true, violations: 0, shouldBan: false };
    } else if (bannedUntil && now >= bannedUntil) {
      this.bannedThreads.delete(threadID);
      this.stats.unbans++;
    }

    let timestamps = this.threadActivity.get(threadID) || [];
    timestamps = timestamps.filter(t => now - t < this.options.timeWindow);
    timestamps.push(now);
    this.threadActivity.set(threadID, timestamps);

    if (timestamps.length >= this.options.commandThreshold) {
      this.bannedThreads.set(threadID, now + this.options.banDuration);
      this.stats.bans++;
      this.stats.violations++;
      return { isBanned: true, violations: timestamps.length, shouldBan: true };
    }

    return { isBanned: false, violations: timestamps.length, shouldBan: false };
  }

  record(threadID, commandName = 'cmd') {
    return this.trackCommand(threadID, commandName);
  }

  isSpamming(threadID) {
    return this.isBanned(threadID);
  }

  isBanned(threadID) {
    const bannedUntil = this.bannedThreads.get(threadID);
    if (!bannedUntil) return false;
    if (Date.now() >= bannedUntil) {
      this.bannedThreads.delete(threadID);
      this.stats.unbans++;
      return false;
    }
    return true;
  }

  unban(threadID) {
    if (this.bannedThreads.delete(threadID)) {
      this.stats.unbans++;
      return true;
    }
    return false;
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, bannedUntil] of this.bannedThreads.entries()) {
      if (now >= bannedUntil) {
        this.bannedThreads.delete(id);
        this.stats.unbans++;
      }
    }
    for (const [id, timestamps] of this.threadActivity.entries()) {
      const valid = timestamps.filter(t => now - t < this.options.timeWindow);
      if (valid.length === 0) {
        this.threadActivity.delete(id);
      } else {
        this.threadActivity.set(id, valid);
      }
    }
    this.stats.cleanups++;
  }

  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

module.exports = SpamTracker;
