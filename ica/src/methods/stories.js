/**
 * @fileoverview NKXICA - Stories API Methods
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Stories
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');
const CryptoUtils = require('../utils/crypto');

class Stories {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
    this.deviceId = options.deviceId;
  }

  /**
   * Get stories from a specific user
   * @param {string} userID - User ID
   * @param {Function} callback - Callback function
   * @returns {Promise<Array>} Stories array
   */
  async getUserStories(userID, callback) {
    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.http.get(
        `https://www.instagram.com/api/v1/feed/user/${validation.id}/reel_media/`
      );

      const stories = response.items?.map(item => ({
        storyId: item.id,
        userId: item.user?.pk,
        timestamp: item.taken_at,
        expiresAt: item.expiring_at,
        mediaType: item.media_type === 1 ? 'photo' : 'video',
        mediaUrl: item.image_versions2?.candidates?.[0]?.url || item.video_versions?.[0]?.url,
        caption: item.caption?.text,
        mentions: item.reel_mentions || [],
        hasAudio: item.has_audio,
        viewCount: item.view_count,
        likeCount: item.like_count
      })) || [];

      if (callback) return callback(null, stories);
      return stories;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get stories from user's following (feed/reels tray)
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   * @returns {Promise<Array>} Stories tray
   */
  async getFeedStories(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const response = await this.http.get(
        'https://www.instagram.com/api/v1/feed/reels_tray/'
      );

      const tray = response.tray?.map(item => ({
        userId: item.user?.pk,
        username: item.user?.username,
        hasBestiesMedia: item.has_besties_media,
        seenIndex: item.seen_index,
        latestReelMedia: item.latest_reel_media,
        expiringAt: item.expiring_at,
        items: item.items?.map(story => ({
          storyId: story.id,
          mediaType: story.media_type === 1 ? 'photo' : 'video',
          mediaUrl: story.image_versions2?.candidates?.[0]?.url || story.video_versions?.[0]?.url,
          timestamp: story.taken_at
        })) || []
      })) || [];

      if (callback) return callback(null, tray);
      return tray;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * View/mark story as seen
   * @param {string} storyId - Story ID
   * @param {string} userId - User ID who posted the story
   * @param {Function} callback - Callback function
   */
  async markAsSeen(storyId, userId, callback) {
    try {
      const data = {
        _uuid: this.uuid,
        _csrftoken: this.http.getCsrfToken() || '',
        live_vod_skipped: false,
        reel_id: userId,
        reel_media_id: storyId,
        container_module: 'reel_feed_timeline'
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        'https://www.instagram.com/api/v2/media/seen/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
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

  /**
   * React to a story with emoji
   * @param {string} storyId - Story ID
   * @param {string} userId - User ID
   * @param {string} emoji - Emoji reaction
   * @param {Function} callback - Callback function
   */
  async react(storyId, userId, emoji, callback) {
    try {
      const data = {
        _uuid: this.uuid,
        _csrftoken: this.http.getCsrfToken() || '',
        reel_id: userId,
        media_id: storyId,
        reaction_emoji: emoji,
        action: 'send_item'
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        'https://www.instagram.com/api/v1/story_reactions/react/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
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

  /**
   * Reply to a story with message
   * @param {string} storyId - Story ID
   * @param {string} userId - User ID
   * @param {string} message - Reply message
   * @param {Function} callback - Callback function
   */
  async reply(storyId, userId, message, callback) {
    try {
      const clientContext = CryptoUtils.generateUUID();

      const data = {
        action: 'send_item',
        send_attribution: 'reel_feed_timeline',
        reel_id: userId,
        item_id: storyId,
        item_type: 'story',
        text: message,
        device_id: this.deviceId,
        _uuid: this.uuid,
        client_context: clientContext,
        offline_threading_id: clientContext
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/story_reply/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      if (response.status === 'ok') {
        const info = {
          threadID: response.payload?.thread_id,
          messageID: response.payload?.item_id || clientContext,
          timestamp: Date.now().toString(),
          clientContext: clientContext
        };

        if (callback) return callback(null, info);
        return info;
      }

      throw new Error(response.message || 'Failed to reply to story');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Share story to thread
   * @param {string} storyId - Story ID
   * @param {string} threadID - Thread ID to share to
   * @param {Function} callback - Callback function
   */
  async shareToThread(storyId, threadID, callback) {
    try {
      const clientContext = CryptoUtils.generateUUID();

      const data = {
        action: 'send_item',
        send_attribution: 'direct_inbox',
        thread_ids: `[${threadID}]`,
        item_id: storyId,
        item_type: 'story_share',
        device_id: this.deviceId,
        _uuid: this.uuid,
        client_context: clientContext,
        offline_threading_id: clientContext
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/story_share/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      if (response.status === 'ok') {
        const info = {
          threadID: threadID,
          messageID: response.payload?.item_id || clientContext,
          timestamp: Date.now().toString(),
          clientContext: clientContext
        };

        if (callback) return callback(null, info);
        return info;
      }

      throw new Error(response.message || 'Failed to share story');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get story viewers
   * @param {string} storyId - Story ID
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async getViewers(storyId, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const maxId = options.cursor || '';
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/media/${storyId}/list_reel_media_viewer/?count=${options.limit || 50}${maxId ? `&max_id=${maxId}` : ''}`
      );

      const viewers = {
        users: response.users?.map(u => FormatUtils.formatUser(u)) || [],
        totalCount: response.total_viewer_count || 0,
        hasMore: !!response.next_max_id,
        cursor: response.next_max_id
      };

      if (callback) return callback(null, viewers);
      return viewers;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get highlights from user
   * @param {string} userID - User ID
   * @param {Function} callback - Callback function
   */
  async getHighlights(userID, callback) {
    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.http.get(
        `https://www.instagram.com/api/v1/highlights/${validation.id}/highlights_tray/`
      );

      const highlights = response.tray?.map(h => ({
        highlightId: h.id,
        title: h.title,
        coverMedia: h.cover_media?.cropped_image_version?.url,
        itemCount: h.media_count,
        createdAt: h.created_at,
        thumbnailUrl: h.thumbnail_url
      })) || [];

      if (callback) return callback(null, highlights);
      return highlights;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = Stories;