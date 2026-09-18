'use strict';

/**
 * services/threads/threadService.js
 *
 * Thread domain service providing:
 * - Thread configuration and prefix resolution.
 * - Thread admin IDs lookup.
 * - Thread ban/mute status queries.
 */

class ThreadService {
  constructor(database) {
    this.database = database;
  }

  get threadsData() {
    return this.database?.threadsData || global.db?.threadsData;
  }

  async getThread(threadID) {
    if (!this.threadsData) return null;
    return await this.threadsData.get(threadID);
  }

  async getPrefix(threadID, defaultPrefix = '!') {
    if (!this.threadsData) return defaultPrefix;
    return await this.threadsData.getPrefix(threadID);
  }

  async setPrefix(threadID, prefix) {
    if (!this.threadsData) return false;
    return await this.threadsData.setPrefix(threadID, prefix);
  }

  async isBanned(threadID) {
    if (!this.threadsData) return false;
    const thread = await this.threadsData.get(threadID);
    return Boolean(thread?.banned?.status);
  }

  async getAdminIDs(threadID) {
    if (!this.threadsData) return [];
    const thread = await this.threadsData.get(threadID);
    const admins = thread?.data?.adminIDs || thread?.adminIDs || [];
    return admins.map(a => String(a.id || a.userID || a));
  }
}

module.exports = { ThreadService };
