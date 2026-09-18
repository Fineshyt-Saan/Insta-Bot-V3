/**
 * @fileoverview NKXICA - Thread History API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module ThreadHistory
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');

class ThreadHistory {
  constructor(httpClient) {
    this.http = httpClient;
  }

  // Get thread message history
  async getHistory(threadID, amount, timestamp, callback) {
    // Handle optional timestamp parameter
    if (typeof timestamp === 'function') {
      callback = timestamp;
      timestamp = null;
    }

    // Default + cap amount
    const limit = Math.min(Math.max(parseInt(amount, 10) || 10, 1), 100);

    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      let cursor = timestamp || '';
      const messages = [];
      let hasMore = true;
      let fetchCount = 0;
      
      while (messages.length < limit && hasMore && fetchCount < 5) {
        const batchSize = Math.min(limit - messages.length, 20);
        const url = `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/?visual_message_return_type=unseen&limit=${batchSize}${cursor ? `&cursor=${cursor}` : ''}`;
        
        const response = await this.http.get(url);
        const thread = response.thread;
        
        if (!thread || !thread.items) break;
        
        const formatted = thread.items.map(item => FormatUtils.formatMessage(item, validation.id, thread));
        messages.push(...formatted);
        
        hasMore = thread.has_older === true;
        cursor = thread.oldest_cursor;
        fetchCount++;
        
        // Add delay between paginated requests to avoid rate limiting
        if (hasMore && messages.length < limit && fetchCount < 5) {
          await this.sleep(1000);
        }

        if (!cursor) break;
      }

      // Trim to requested amount
      const result = messages.slice(0, limit);
      
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Sleep utility for rate limiting
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get messages newer than timestamp
  async getNewer(threadID, timestamp, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const url = `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/?visual_message_return_type=unseen&limit=20`;
      
      const response = await this.http.get(url);
      const thread = response.thread;
      
      if (!thread || !thread.items) {
        return callback ? callback(null, []) : [];
      }
      
      const newerMessages = thread.items
        .filter(item => item.timestamp > timestamp)
        .map(item => FormatUtils.formatMessage(item, validation.id, thread));
      
      if (callback) return callback(null, newerMessages);
      return newerMessages;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get messages around a specific message ID
  async getAround(threadID, messageID, limit = 10, callback) {
    if (typeof limit === 'function') {
      callback = limit;
      limit = 10;
    }

    try {
      // Get recent messages and find the anchor
      const recent = await this.getHistory(threadID, 50);
      const index = recent.findIndex(m => m.messageID === messageID);
      
      if (index === -1) {
        throw new Error('Message not found in recent history');
      }
      
      // Get messages around the anchor
      const start = Math.max(0, index - Math.floor(limit / 2));
      const end = Math.min(recent.length, start + limit);
      const result = recent.slice(start, end);
      
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = ThreadHistory;
