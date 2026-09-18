/**
 * @fileoverview NKXICA - Unsend Message API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module UnsendMessage
 * @since 1.0.0
 */

const ThreadHistory = require('./threadHistory');

class UnsendMessage {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
  }

  // Unsend/delete a message
  async unsend(messageID, threadID, callback) {
    if (typeof threadID === 'function') {
      callback = threadID;
      threadID = null;
    }

    try {
      if (!messageID) {
        throw new Error('Message ID is required');
      }

      const resolvedThreadID = await this.resolveThreadID(messageID, threadID);
      const csrfToken = this.http.getCsrfToken();
      if (!csrfToken) {
        throw new Error('Missing csrftoken cookie');
      }

      const response = await this.http.postForm(
        `https://www.instagram.com/api/v1/direct_v2/threads/${resolvedThreadID}/items/${messageID}/delete/`,
        {
          _uuid: this.uuid,
          _csrftoken: csrfToken
        }
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async resolveThreadID(messageID, threadID) {
    if (threadID) {
      return threadID.toString();
    }

    const remembered = this.http.getRememberedThread(messageID);
    if (remembered) {
      return remembered;
    }

    const inbox = await this.http.get(
      'https://www.instagram.com/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&limit=50&thread_message_limit=10'
    );
    const threads = inbox?.inbox?.threads || [];
    const match = threads.find((thread) =>
      (thread.items || []).some((item) => item.item_id?.toString() === messageID.toString()) ||
      thread.last_permanent_item?.item_id?.toString() === messageID.toString()
    );

    if (!match?.thread_id) {
      throw new Error('Could not resolve thread ID for message');
    }

    this.http.rememberMessageThread(messageID, match.thread_id);
    return match.thread_id.toString();
  }

  // Alias for unsend
  delete(messageID, callback) {
    return this.unsend(messageID, null, callback);
  }

  // Unsend multiple messages
  async batch(messageIDs, callback) {
    try {
      const results = [];
      
      for (const messageID of messageIDs) {
        try {
          const success = await this.unsend(messageID);
          results.push({ messageID, success });
        } catch (error) {
          results.push({ messageID, success: false, error: error.message });
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

  // Unsend last message in thread
  async unsendLast(threadID, callback) {
    try {
      // Get thread history to find last message from current user
      const history = new ThreadHistory(this.http, { uuid: this.uuid });
      
      const messages = await history.getHistory(threadID, 10);
      const lastMessage = messages.find(m => m.isCurrentUser === true);
      
      if (!lastMessage) {
        throw new Error('No recent message found from current user');
      }

      const success = await this.unsend(lastMessage.messageID);
      
      if (callback) return callback(null, { success, messageID: lastMessage.messageID });
      return { success, messageID: lastMessage.messageID };
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = UnsendMessage;