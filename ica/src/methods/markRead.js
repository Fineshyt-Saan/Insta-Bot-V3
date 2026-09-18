/**
 * @fileoverview NKXICA - Mark Read API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module MarkRead
 * @since 1.0.0
 */

const ValidationUtils = require('../utils/validation');

class MarkRead {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
  }

  // Mark thread as read
  async markAsRead(threadID, read = true, callback) {
    // Handle optional read parameter
    if (typeof read === 'function') {
      callback = read;
      read = true;
    }

    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      if (read) {
        const csrfToken = this.http.getCsrfToken();
        if (!csrfToken) {
          throw new Error('Missing csrftoken cookie');
        }

        // Fetch the thread to get the latest item ID
        const thread = await this.http.get(
          `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/?visual_message_return_type=unseen&limit=1`
        );
        const itemId =
          thread?.thread?.items?.[0]?.item_id ||
          thread?.thread?.last_permanent_item?.item_id;

        const baseForm = {
          _csrftoken: csrfToken,
          _uuid: this.uuid,
          use_unified_inbox: 'true'
        };

        // Build all candidate seen URLs (item-specific + thread-level fallbacks)
        const seenUrls = itemId
          ? [
              `https://i.instagram.com/api/v1/direct_v2/threads/${validation.id}/items/${itemId}/seen/`,
              `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/items/${itemId}/seen/`
            ]
          : [];

        // Thread-level seen fallbacks
        const threadLevelUrls = [
          `https://i.instagram.com/api/v1/direct_v2/threads/${validation.id}/seen/`,
          `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/seen/`
        ];

        const allUrls = [...seenUrls, ...threadLevelUrls];

        let succeeded = false;
        for (const url of allUrls) {
          try {
            const form = { ...baseForm };
            if (itemId) form.item_id = itemId;
            await this.http.postForm(url, form);
            succeeded = true;
            break;
          } catch (err) {
            const recoverable = /404|400|None|not supported/i.test(err.message) ||
              err.message.includes('Instagram API Error');
            if (!recoverable) throw err;
          }
        }

        // Non-fatal if all endpoints fail — mark-as-read is best-effort
      } else {
        // Mark as unread — not directly supported; no-op
      }

      if (callback) return callback(null, true);
      return true;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Mark thread as unread (limited support)
  async markAsUnread(threadID, callback) {
    if (callback) return callback(null, false);
    return false;
  }

  // Mark multiple threads as read
  async markMultipleAsRead(threadIDs, callback) {
    try {
      const results = [];

      for (const threadID of threadIDs) {
        try {
          await this.markAsRead(threadID);
          results.push({ threadID, success: true });
        } catch (error) {
          results.push({ threadID, success: false, error: error.message });
        }
      }

      const summary = {
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };

      if (callback) return callback(null, summary);
      return summary;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = MarkRead;