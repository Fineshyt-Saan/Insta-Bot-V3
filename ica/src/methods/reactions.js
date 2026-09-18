/**
 * @fileoverview NKXICA - Reactions API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Reactions
 * @since 1.0.0
 */

class Reactions {
  constructor(httpClient, options = {}) {
    this.http    = httpClient;
    this.getMqtt = options.getMqtt || null;
  }

  _resolveThreadId(messageID, explicitThreadID) {
    if (explicitThreadID && typeof explicitThreadID !== 'function' && typeof explicitThreadID !== 'boolean') {
      return explicitThreadID.toString();
    }
    if (!messageID) return this.http?.lastThreadID || null;
    return this.http.getRememberedThread(messageID) || this.http?.lastThreadID || null;
  }

  _mqtt() {
    const mqtt = this.getMqtt && this.getMqtt();
    if (!mqtt || !mqtt.connected) throw new Error('MQTT not connected — call listen() before reacting');
    return mqtt;
  }

  async send(reaction, messageID, threadIDOrCallback, callback) {
    if (typeof threadIDOrCallback === 'function') {
      callback = threadIDOrCallback;
      threadIDOrCallback = null;
    } else if (typeof threadIDOrCallback === 'boolean') {
      threadIDOrCallback = null;
    }
    try {
      if (!messageID) throw new Error('Message ID is required');
      if (!reaction)  throw new Error('Reaction emoji is required');

      const threadID = this._resolveThreadId(messageID, threadIDOrCallback);
      if (!threadID) {
        throw new Error('Could not resolve thread ID for message. Send a message first so the thread is remembered.');
      }

      await this._mqtt().sendReaction(threadID, messageID, reaction, 'created');

      if (callback) return callback(null, true);
      return true;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async remove(messageID, threadIDOrCallback, callback) {
    if (typeof threadIDOrCallback === 'function') {
      callback = threadIDOrCallback;
      threadIDOrCallback = null;
    } else if (typeof threadIDOrCallback === 'boolean') {
      threadIDOrCallback = null;
    }
    try {
      if (!messageID) throw new Error('Message ID is required');

      const threadID = this._resolveThreadId(messageID, threadIDOrCallback);
      if (!threadID) {
        throw new Error('Could not resolve thread ID for message. Send a message first so the thread is remembered.');
      }

      await this._mqtt().sendReaction(threadID, messageID, '', 'deleted');

      if (callback) return callback(null, true);
      return true;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async toggle(reaction, messageID, threadIDOrCallback, callback) {
    if (typeof threadIDOrCallback === 'function') {
      callback = threadIDOrCallback;
      threadIDOrCallback = null;
    }
    try {
      try {
        await this.remove(messageID, threadIDOrCallback);
        if (callback) return callback(null, { removed: true, added: false });
        return { removed: true, added: false };
      } catch {
        await this.send(reaction, messageID, threadIDOrCallback);
        if (callback) return callback(null, { removed: false, added: true });
        return { removed: false, added: true };
      }
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  async like(messageID, callback)       { return this.send('❤️', messageID, callback); }
  async love(messageID, callback)       { return this.send('❤️', messageID, callback); }
  async laugh(messageID, callback)      { return this.send('😂', messageID, callback); }
  async wow(messageID, callback)        { return this.send('😮', messageID, callback); }
  async sad(messageID, callback)        { return this.send('😢', messageID, callback); }
  async angry(messageID, callback)      { return this.send('😡', messageID, callback); }
  async thumbsUp(messageID, callback)   { return this.send('👍', messageID, callback); }
  async thumbsDown(messageID, callback) { return this.send('👎', messageID, callback); }
}

module.exports = Reactions;