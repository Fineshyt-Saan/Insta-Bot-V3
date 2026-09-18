/**
 * @fileoverview NKXICA - Typing Indicator API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module TypingIndicator
 * @since 1.0.0
 */

const ValidationUtils = require('../utils/validation');

class TypingIndicator {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
    this.activeIndicators = new Set();
  }

  async indicate(threadID, isActive) {
    const csrfToken = this.http.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Missing csrftoken cookie');
    }

    const form = {
      _csrftoken: csrfToken,
      _uuid: this.uuid,
      thread_id: threadID,
      activity_status: isActive ? '1' : '0'
    };

    const urls = [
      `https://www.instagram.com/api/v1/direct_v2/threads/${threadID}/indicate_activity/`,
      `https://i.instagram.com/api/v1/direct_v2/threads/${threadID}/indicate_activity/`,
      `https://www.instagram.com/api/v1/direct_v2/typing/`,
      `https://i.instagram.com/api/v1/direct_v2/typing/`,
      `https://www.instagram.com/api/v1/direct_v2/threads/${threadID}/activity_indicator/`,
      `https://i.instagram.com/api/v1/direct_v2/threads/${threadID}/activity_indicator/`
    ];

    let lastError;
    for (const url of urls) {
      try {
        await this.http.postForm(url, form);
        return;
      } catch (error) {
        lastError = error;
        const recoverable = /404|400|None|not supported|feature/i.test(error.message) ||
          (error.message && error.message.includes('Instagram API Error'));
        if (!recoverable) {
          throw error;
        }
      }
    }

    // All URLs failed with recoverable errors (endpoint not available via HTTP).
    // Typing indicators via HTTP are unreliable on Instagram — fail silently.
  }

  // Send typing indicator
  async start(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      await this.indicate(validation.id, true);

      this.activeIndicators.add(validation.id);
      
      if (callback) return callback(null);
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Stop typing indicator
  async stop(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      await this.indicate(validation.id, false);

      this.activeIndicators.delete(validation.id);
      
      if (callback) return callback(null);
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Send typing indicator with auto-stop after duration
  async sendWithDuration(threadID, durationMs = 3000, callback) {
    try {
      await this.start(threadID);
      
      setTimeout(() => {
        this.stop(threadID).catch(() => {});
      }, durationMs);
      
      if (callback) return callback(null);
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Stop all active typing indicators
  async stopAll(callback) {
    try {
      const promises = Array.from(this.activeIndicators).map(threadID => 
        this.stop(threadID).catch(() => {})
      );
      
      await Promise.all(promises);
      this.activeIndicators.clear();
      
      if (callback) return callback(null);
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Check if typing indicator is active for thread
  isActive(threadID) {
    return this.activeIndicators.has(threadID.toString());
  }
}

module.exports = TypingIndicator;