/**
 * @fileoverview NKXICA - Live API Methods
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Live
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');
const CryptoUtils = require('../utils/crypto');

class Live {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
    this.deviceId = options.deviceId;
  }

  /**
   * Get current live broadcasts from following
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   * @returns {Promise<Array>} Live broadcasts
   */
  async getLiveFeed(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const response = await this.http.get(
        'https://www.instagram.com/api/v1/live/get_live_broadcasts/'
      );

      const broadcasts = response.broadcasts?.map(b => ({
        broadcastId: b.id,
        user: FormatUtils.formatUser(b.broadcast_owner),
        status: b.broadcast_status,
        viewerCount: b.viewer_count,
        title: b.broadcast_title,
        startedAt: b.broadcast_started_at,
        isMuted: b.is_player_live_trace_enabled,
        dashPlaybackUrl: b.dash_playback_url,
        coverFrameUrl: b.cover_frame_url
      })) || [];

      if (callback) return callback(null, broadcasts);
      return broadcasts;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get suggested live broadcasts
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async getSuggestedLive(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/live/get_suggested_live_broadcasts/?count=${options.limit || 10}`
      );

      const broadcasts = response.broadcasts?.map(b => ({
        broadcastId: b.id,
        user: FormatUtils.formatUser(b.broadcast_owner),
        viewerCount: b.viewer_count,
        title: b.broadcast_title,
        coverFrameUrl: b.cover_frame_url
      })) || [];

      if (callback) return callback(null, broadcasts);
      return broadcasts;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get live broadcast info
   * @param {string} broadcastId - Broadcast ID
   * @param {Function} callback - Callback function
   */
  async getBroadcastInfo(broadcastId, callback) {
    try {
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/live/${broadcastId}/get_info/`
      );

      const info = {
        broadcastId: response.broadcast?.id,
        user: FormatUtils.formatUser(response.broadcast?.broadcast_owner),
        status: response.broadcast?.broadcast_status,
        viewerCount: response.broadcast?.viewer_count,
        totalUniqueViewerCount: response.broadcast?.total_unique_viewer_count,
        title: response.broadcast?.broadcast_title,
        startedAt: response.broadcast?.broadcast_started_at,
        dashPlaybackUrl: response.broadcast?.dash_playback_url,
        coverFrameUrl: response.broadcast?.cover_frame_url,
        isMuted: response.broadcast?.is_player_live_trace_enabled,
        canComment: response.broadcast?.can_comment,
        canReact: response.broadcast?.can_react,
        hideEmojiOnlyComments: response.broadcast?.hide_emoji_only_comments
      };

      if (callback) return callback(null, info);
      return info;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get live comments
   * @param {string} broadcastId - Broadcast ID
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async getComments(broadcastId, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const lastCommentTs = options.lastCommentTs || 0;
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/live/${broadcastId}/get_comment/?last_comment_ts=${lastCommentTs}`
      );

      const comments = {
        comments: response.comments?.map(c => ({
          commentId: c.pk,
          userId: c.user_id,
          username: c.user?.username,
          text: c.text,
          timestamp: c.created_at,
          isHeart: c.did_report_as_spam === false && c.text === '❤️'
        })) || [],
        pinnedComment: response.pinned_comment,
        commentMuted: response.comment_muted,
        commentCount: response.comment_count,
        hasMore: response.has_more_comments,
        lastCommentTs: response.last_comment_ts
      };

      if (callback) return callback(null, comments);
      return comments;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get live viewer list
   * @param {string} broadcastId - Broadcast ID
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async getViewers(broadcastId, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const cursor = options.cursor || '';
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/live/${broadcastId}/get_viewer_list/?count=${options.limit || 50}${cursor ? `&cursor=${cursor}` : ''}`
      );

      const viewers = {
        users: response.users?.map(u => FormatUtils.formatUser(u)) || [],
        totalCount: response.total_viewer_count,
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
   * Send comment to live broadcast
   * @param {string} broadcastId - Broadcast ID
   * @param {string} message - Comment message
   * @param {Function} callback - Callback function
   */
  async sendComment(broadcastId, message, callback) {
    try {
      const data = {
        idempotence_token: CryptoUtils.generateUUID(),
        comment_text: message,
        live_or_on_live: true,
        container_module: 'live_broadcast'
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        `https://www.instagram.com/api/v1/live/${broadcastId}/comment/`,
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      if (response.status === 'ok') {
        const info = {
          commentId: response.comment?.pk,
          text: response.comment?.text,
          timestamp: response.comment?.created_at
        };

        if (callback) return callback(null, info);
        return info;
      }

      throw new Error(response.message || 'Failed to send comment');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Send heart/reaction to live broadcast
   * @param {string} broadcastId - Broadcast ID
   * @param {number} count - Number of hearts
   * @param {Function} callback - Callback function
   */
  async sendHeart(broadcastId, count = 1, callback) {
    try {
      const data = {
        offset_to_video_start: 0,
        reaction_type: 'heart',
        reaction_count: count,
        device_id: this.deviceId
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      const response = await this.http.post(
        `https://www.instagram.com/api/v1/live/${broadcastId}/react/`,
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
   * Mute live broadcast comments
   * @param {string} broadcastId - Broadcast ID
   * @param {Function} callback - Callback function
   */
  async muteComments(broadcastId, callback) {
    try {
      const response = await this.http.post(
        `https://www.instagram.com/api/v1/live/${broadcastId}/mute_comment/`
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
   * Unmute live broadcast comments
   * @param {string} broadcastId - Broadcast ID
   * @param {Function} callback - Callback function
   */
  async unmuteComments(broadcastId, callback) {
    try {
      const response = await this.http.post(
        `https://www.instagram.com/api/v1/live/${broadcastId}/unmute_comment/`
      );

      const success = response.status === 'ok';

      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = Live;