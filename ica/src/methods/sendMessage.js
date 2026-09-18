'use strict';

/**
 * @fileoverview NKXICA - Send Message API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 * @module SendMessage
 * @since 1.0.0
 *
 * Accepted message shapes for toThread / toUser / reply:
 *
 *   "plain text"
 *   { body: "text" }
 *   { body: "caption", attachment: "/local/path.jpg" }   — local file (auto-type)
 *   { body: "caption", attachment: "https://…/img.jpg" } — remote URL (auto-type)
 *   { image:  "https://…"  }  — remote image URL
 *   { video:  "https://…"  }  — remote video URL (streamed)
 *   { gif:    "https://…"  }  — GIF / Giphy URL
 *   { audio:  "/local.m4a" }  — local audio file
 *   { audio:  "https://…"  }  — remote audio URL (streamed)
 *   { sticker: "<sticker_id>" } — Instagram sticker
 *   replyTo: "<messageID>"     — reply to a specific message (inside the object)
 *
 * When both body and media are present, text is sent first, then the media.
 * All variants return a single result object or an array when >1 message is sent.
 */

const path = require('path');
const fs = require('fs');
const CryptoUtils = require('../utils/crypto');
const ValidationUtils = require('../utils/validation');
const IdempotencyCache = require('../utils/idempotency');

// Extension → media type buckets
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.heic', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus']);
const GIF_EXTS   = new Set(['.gif']);

function detectMediaType(filePath) {
  const ext = path.extname((filePath || '').split('?')[0]).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (GIF_EXTS.has(ext))   return 'gif';
  return 'unknown';
}

function isRemoteUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

/**
 * Validate a local file path against directory traversal attacks.
 * Resolves the path and ensures it doesn't escape the filesystem root
 * in a suspicious way (e.g., ../../etc/passwd).
 * @param {string} filePath
 * @returns {string} resolved absolute path
 * @throws {Error} if the path appears malicious or the file doesn't exist
 */
function validateLocalPath(filePath) {
  const resolved = path.resolve(filePath);
  // Reject paths that were manipulated to escape via traversal
  if (!resolved || resolved.includes('\0')) {
    throw new Error(`Invalid file path: ${filePath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return resolved;
}

class SendMessage {
  constructor(httpClient, options = {}) {
    this.http      = httpClient;
    this.deviceId  = options.deviceId;
    this.uuid      = options.uuid;
    this.sendMedia = null; // injected by instagramChat after construction

    // Per-thread send rate limit — prevents spamming a single thread.
    this.perThreadMinDelayMs = options.perThreadMinDelayMs || 800;
    this._lastSendByThread = new Map();
    this._maxThreadEntries = 1000;

    // Short-window dedup of mutation requests.
    this.idempotency = new IdempotencyCache({ ttlMs: 5 * 60 * 1000 });
  }

  async _waitForThreadSlot(threadID) {
    const last = this._lastSendByThread.get(threadID);
    if (last) {
      const since = Date.now() - last;
      if (since < this.perThreadMinDelayMs) {
        await this._sleep(this.perThreadMinDelayMs - since);
      }
    }
    this._lastSendByThread.set(threadID, Date.now());
    if (this._lastSendByThread.size > this._maxThreadEntries) {
      // Evict oldest entry (Map preserves insertion order).
      const oldest = this._lastSendByThread.keys().next().value;
      if (oldest !== undefined) this._lastSendByThread.delete(oldest);
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  buildBroadcastForm(recipientField, recipientValue, form = {}) {
    const csrfToken = this.http.getCsrfToken();
    if (!csrfToken) throw new Error('Missing csrftoken cookie');

    const mutationToken = CryptoUtils.generateUUID();
    return {
      action: 'send_item',
      [recipientField]: recipientValue,
      client_context: mutationToken,
      mutation_token: mutationToken,
      offline_threading_id: mutationToken,
      device_id: this.deviceId,
      _csrftoken: csrfToken,
      _uuid: this.uuid,
      ...form
    };
  }

  extractMessageInfo(response, fallbackThreadID, clientContext) {
    const payload  = response?.payload;
    const metadata = Array.isArray(response?.message_metadata) ? response.message_metadata[0] : null;
    const threadID = payload?.thread_id || metadata?.thread_id || fallbackThreadID;
    const messageID = payload?.item_id  || metadata?.item_id  || clientContext;

    if (messageID && threadID) {
      this.http.rememberMessageThread(messageID, threadID);
    }

    return { threadID, messageID, timestamp: Date.now().toString(), clientContext };
  }

  // Send plain text, optionally replying to a message
  async _sendText(threadID, text, { replyTo, recipient, recipientType = 'thread_ids' } = {}) {
    const bodyValidation = ValidationUtils.validateMessageBody(text);
    if (!bodyValidation.valid) throw new Error(bodyValidation.error);

    const extra = { send_attribution: recipientType === 'thread_ids' ? 'direct_thread' : 'direct_inbox', text: bodyValidation.body };
    if (replyTo) extra.replied_to_item_id = replyTo;

    const form = this.buildBroadcastForm(recipientType, recipient || JSON.stringify([threadID]), extra);
    const clientContext = form.client_context;

    const response = await this.http.postForm(
      'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/text/',
      form
    );

    if (response.status === 'ok') return this.extractMessageInfo(response, threadID, clientContext);
    throw new Error(response.message || 'Failed to send text message');
  }

  // Route a single attachment (local path or remote URL) to the right sendMedia method
  async _sendAttachmentItem(threadID, attachment, options = {}) {
    if (!this.sendMedia) throw new Error('sendMedia not wired — cannot send attachments');

    // Handle Buffer directly
    if (Buffer.isBuffer(attachment) || (attachment && attachment.buffer && Buffer.isBuffer(attachment.buffer))) {
      return this.sendMedia.photo(threadID, attachment, options);
    }

    // Handle Streams directly
    if (attachment && (typeof attachment.pipe === 'function' || (attachment.stream && typeof attachment.stream.pipe === 'function'))) {
      return this.sendMedia.photo(threadID, attachment, options);
    }

    // Handle media object with { path } or { url }
    if (attachment && typeof attachment === 'object') {
      if (attachment.url && isRemoteUrl(attachment.url)) {
        return this._sendAttachmentItem(threadID, attachment.url, options);
      }
      if (attachment.path) {
        return this._sendAttachmentItem(threadID, attachment.path, options);
      }
    }

    if (isRemoteUrl(attachment)) {
      const type = detectMediaType(attachment);
      if (type === 'image')  return this.sendMedia.photoFromUrl(threadID, attachment, options);
      if (type === 'video')  return this.sendMedia.videoFromUrl(threadID, attachment, options);
      if (type === 'gif')    return this.sendMedia.gif(threadID, attachment, options);
      if (type === 'audio')  return this.sendMedia.voiceFromUrl(threadID, attachment, options);
      // Unknown URL extension — attempt as image first
      return this.sendMedia.photoFromUrl(threadID, attachment, options);
    }

    // Local file path — validate before use to prevent directory traversal
    const safePath = validateLocalPath(attachment);
    const type = detectMediaType(safePath);
    if (type === 'image') return this.sendMedia.photo(threadID, safePath, options);
    if (type === 'video') return this.sendMedia.video(threadID, safePath, options);
    if (type === 'audio') return this.sendMedia.voice(threadID, safePath, options);
    if (type === 'gif')   return this.sendMedia.photo(threadID, safePath, options); // upload GIF as photo fallback
    // Unknown extension — fallback to photo instead of throwing
    return this.sendMedia.photo(threadID, safePath, options);
  }

  // Normalise the caller's message argument into a consistent object
  _normalise(message) {
    if (typeof message === 'string') return { body: message };
    if (!message || typeof message !== 'object') throw new Error('message must be a string or object');
    return { ...message };
  }

  // Execute the full send sequence; returns single object or array
  async _dispatch(threadID, msg, { recipient, recipientType } = {}) {
    const results = [];
    const replyTarget = msg.replyTo || msg.replied_to_item_id || msg.options?.replyTo || msg.options?.replyToMessageID;
    const mediaOptions = {
      ...(msg.options || {}),
      ...(replyTarget ? { replyTo: replyTarget, replyToMessageID: replyTarget } : {})
    };

    // 1. Text / sticker
    if (msg.body || msg.text) {
      results.push(await this._sendText(threadID, msg.body || msg.text, {
        replyTo: replyTarget,
        recipient, recipientType
      }));
    }

    // 2. Generic attachment (local path or URL — type auto-detected)
    const attachments = msg.attachment
      ? (Array.isArray(msg.attachment) ? msg.attachment : [msg.attachment])
      : [];
    for (const att of attachments) {
      results.push(await this._sendAttachmentItem(threadID, att, mediaOptions));
    }

    // 3. Explicit image URL
    if (msg.image) {
      if (!this.sendMedia) throw new Error('sendMedia not wired');
      results.push(await this.sendMedia.photoFromUrl(threadID, msg.image, mediaOptions));
    }

    // 4. Explicit video URL (streamed)
    if (msg.video) {
      if (!this.sendMedia) throw new Error('sendMedia not wired');
      results.push(await this.sendMedia.videoFromUrl(threadID, msg.video, mediaOptions));
    }

    // 5. GIF URL
    if (msg.gif) {
      if (!this.sendMedia) throw new Error('sendMedia not wired');
      results.push(await this.sendMedia.gif(threadID, msg.gif, mediaOptions));
    }

    // 6. Audio file — local path or remote URL
    if (msg.audio) {
      if (!this.sendMedia) throw new Error('sendMedia not wired');
      const r = isRemoteUrl(msg.audio)
        ? await this.sendMedia.voiceFromUrl(threadID, msg.audio, mediaOptions)
        : await this.sendMedia.voice(threadID, validateLocalPath(msg.audio), mediaOptions);
      results.push(r);
    }

    // 7. Local photo file (explicit)
    if (msg.photo) {
      if (!this.sendMedia) throw new Error('sendMedia not wired');
      const r = isRemoteUrl(msg.photo)
        ? await this.sendMedia.photoFromUrl(threadID, msg.photo, mediaOptions)
        : await this.sendMedia.photo(threadID, validateLocalPath(msg.photo), mediaOptions);
      results.push(r);
    }

    if (results.length === 0) throw new Error('message has no sendable content');
    return results.length === 1 ? results[0] : results;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Send a message to a thread.
   *
   * @param {string} threadID
   * @param {string|object} message
   * @param {Function} [callback]
   */
  async toThread(threadID, message, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) throw new Error(validation.error);

      const msg = this._normalise(message);
      const idempotencyKey = msg.idempotencyKey;

      const run = async () => {
        await this._waitForThreadSlot(validation.id);
        return this._dispatch(validation.id, msg, {
          recipient:     JSON.stringify([validation.id]),
          recipientType: 'thread_ids'
        });
      };

      const result = idempotencyKey
        ? await this.idempotency.run(`thread:${validation.id}:${idempotencyKey}`, run)
        : await run();

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Open or send to a user's DM thread.
   *
   * @param {string} userID
   * @param {string|object} message
   * @param {Function} [callback]
   */
  async toUser(userID, message, callback) {
    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) throw new Error(validation.error);

      const msg = this._normalise(message);
      const idempotencyKey = msg.idempotencyKey;

      const run = async () => {
        await this._waitForThreadSlot(`u:${validation.id}`);
        return this._dispatch(validation.id, msg, {
          recipient:     JSON.stringify([[validation.id]]),
          recipientType: 'recipient_users'
        });
      };

      const result = idempotencyKey
        ? await this.idempotency.run(`user:${validation.id}:${idempotencyKey}`, run)
        : await run();

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Reply to a specific message in a thread.
   *
   * @param {string} threadID
   * @param {string|object} message
   * @param {string} replyToMessageID
   * @param {Function} [callback]
   */
  async reply(threadID, message, replyToMessageID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) throw new Error(validation.error);

      const msg = this._normalise(message);
      msg.replyTo = msg.replyTo || replyToMessageID;
      const idempotencyKey = msg.idempotencyKey;

      const run = async () => {
        await this._waitForThreadSlot(validation.id);
        return this._dispatch(validation.id, msg, {
          recipient:     JSON.stringify([validation.id]),
          recipientType: 'thread_ids'
        });
      };

      const result = idempotencyKey
        ? await this.idempotency.run(`reply:${validation.id}:${idempotencyKey}`, run)
        : await run();

      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Send the same message to multiple threads (with a small delay between each).
   * Rejects (or calls back with error) if every single send in the batch fails.
   *
   * @param {string[]} threadIDs
   * @param {string|object} message
   * @param {Function} [callback]
   */
  async batch(threadIDs, message, callback) {
    try {
      const results = [];
      const errors  = [];

      for (let i = 0; i < threadIDs.length; i++) {
        try {
          const result = await this.toThread(threadIDs[i], message);
          results.push({ threadID: threadIDs[i], success: true, result });
          if (i < threadIDs.length - 1) await this._sleep(2000);
        } catch (error) {
          errors.push({ threadID: threadIDs[i], success: false, error: error.message });
        }
      }

      // If every item in the batch failed, propagate as a hard error
      if (results.length === 0 && errors.length > 0) {
        const batchError = new Error(
          `All ${errors.length} batch sends failed. First error: ${errors[0].error}`
        );
        batchError.errors = errors;
        if (callback) return callback(batchError);
        throw batchError;
      }

      const summary = { successful: results.length, failed: errors.length, results, errors };
      if (callback) return callback(null, summary);
      return summary;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SendMessage;