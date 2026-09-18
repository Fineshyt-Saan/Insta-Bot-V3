/**
 * @fileoverview NKXICA - Thread Info API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 * @module ThreadInfo
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');

class ThreadInfo {
  constructor(httpClient) {
    this.http = httpClient;
  }

  // Get thread information
  async get(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const url = `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/?visual_message_return_type=unseen&limit=1`;
      const response = await this.http.get(url);
      
      const thread = response.thread;
      if (!thread) {
        throw new Error('Thread not found');
      }
      
      const info = FormatUtils.formatThread(thread);
      
      if (callback) return callback(null, info);
      return info;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get multiple threads info
  async getMultiple(threadIDs, callback) {
    try {
      const results = [];
      
      for (const threadID of threadIDs) {
        try {
          const info = await this.get(threadID);
          results.push({ threadID, success: true, info });
          // Add delay between batch requests to avoid rate limiting
          if (threadIDs.indexOf(threadID) < threadIDs.length - 1) {
            await this.sleep(1500);
          }
        } catch (error) {
          results.push({ threadID, success: false, error: error.message });
        }
      }

      if (callback) return callback(null, results);
      return results;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Sleep utility for rate limiting
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get inbox threads
  async getInbox(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 20;
      const cursor = options.cursor ? `&cursor=${encodeURIComponent(options.cursor)}` : '';
      const folder = options.folder ? `&folder=${encodeURIComponent(options.folder)}` : '';
      
      const url = `https://www.instagram.com/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&limit=${limit}&thread_message_limit=10${cursor}${folder}`;
      
      const response = await this.http.get(url);
      const inbox = FormatUtils.formatInbox(response.inbox);
      
      if (callback) return callback(null, inbox);
      return inbox;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get pending message requests
  async getPending(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 20;
      
      const url = `https://www.instagram.com/api/v1/direct_v2/pending_inbox/?limit=${limit}`;
      
      const response = await this.http.get(url);
      const pending = FormatUtils.formatInbox(response.inbox);
      
      if (callback) return callback(null, pending);
      return pending;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Search threads
  async search(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      // Instagram doesn't have direct thread search, so we search users
      const url = `https://www.instagram.com/api/v1/users/search/?q=${encodeURIComponent(query)}&count=${options.limit || 30}`;
      
      const response = await this.http.get(url);
      const users = response.users?.map(u => FormatUtils.formatUser(u)) || [];
      
      if (callback) return callback(null, users);
      return users;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = ThreadInfo;