/**
 * @fileoverview NKXICA - Search API Methods
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Search
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');

class Search {
  constructor(httpClient) {
    this.http = httpClient;
  }

  /**
   * Search users by query
   * @param {string} query - Search query
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async users(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 30;
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/users/search/?q=${encodeURIComponent(query)}&count=${limit}&timezone_offset=0&search_surface=default`
      );

      const users = response.users?.map(u => FormatUtils.formatUser(u)) || [];

      if (callback) return callback(null, users);
      return users;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Search hashtags
   * @param {string} query - Search query
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async hashtags(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 30;
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/tags/search/?q=${encodeURIComponent(query)}&count=${limit}&timezone_offset=0`
      );

      const hashtags = response.results?.map(h => ({
        name: h.name,
        id: h.id,
        mediaCount: h.media_count,
        followStatus: h.follow_status
      })) || [];

      if (callback) return callback(null, hashtags);
      return hashtags;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Search locations/places
   * @param {string} query - Search query
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async places(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 30;
      const latitude = options.latitude || 0;
      const longitude = options.longitude || 0;

      const response = await this.http.get(
        `https://www.instagram.com/api/v1/places/search/?query=${encodeURIComponent(query)}&count=${limit}&latitude=${latitude}&longitude=${longitude}&timezone_offset=0`
      );

      const places = response.items?.map(p => ({
        locationId: p.location?.pk,
        name: p.title,
        subtitle: p.subtitle,
        city: p.location?.city,
        address: p.location?.address,
        lat: p.location?.lat,
        lng: p.location?.lng,
        category: p.location?.category
      })) || [];

      if (callback) return callback(null, places);
      return places;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Search audio/music
   * @param {string} query - Search query
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async audio(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 30;
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/music/search/?q=${encodeURIComponent(query)}&count=${limit}`
      );

      const tracks = response.results?.map(t => ({
        trackId: t.id,
        title: t.title,
        artist: t.display_artist,
        duration: t.duration_in_ms,
        coverArt: t.cover_artwork_thumbnail_uri,
        audioUri: t.audio_cluster_id,
        isTrending: t.is_trending_in_clips
      })) || [];

      if (callback) return callback(null, tracks);
      return tracks;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Search reels by query
   * @param {string} query - Search query
   * @param {Object} options - Options
   * @param {Function} callback - Callback function
   */
  async reels(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const cursor = options.cursor || '';
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/clips/search/?query=${encodeURIComponent(query)}&count=${options.limit || 10}${cursor ? `&max_id=${cursor}` : ''}`
      );

      const reels = {
        items: response.results?.map(r => ({
          reelId: r.media?.id,
          user: FormatUtils.formatUser(r.media?.user),
          caption: r.media?.caption?.text,
          likeCount: r.media?.like_count,
          commentCount: r.media?.comment_count,
          playCount: r.media?.play_count,
          videoUrl: r.media?.video_versions?.[0]?.url,
          thumbnailUrl: r.media?.image_versions2?.candidates?.[0]?.url,
          duration: r.media?.video_duration
        })) || [],
        hasMore: !!response.next_max_id,
        cursor: response.next_max_id
      };

      if (callback) return callback(null, reels);
      return reels;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get trending searches
   * @param {Function} callback - Callback function
   */
  async getTrending(callback) {
    try {
      const response = await this.http.get(
        'https://www.instagram.com/api/v1/tags/top_search/?rank_token=default&timestamp=' + Date.now()
      );

      const trending = {
        hashtags: response.tags?.map(t => ({
          name: t.name,
          id: t.id,
          mediaCount: t.media_count
        })) || [],
        users: response.users?.map(u => FormatUtils.formatUser(u)) || []
      };

      if (callback) return callback(null, trending);
      return trending;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Get recent searches
   * @param {Function} callback - Callback function
   */
  async getRecent(callback) {
    try {
      const response = await this.http.get(
        'https://www.instagram.com/api/v1/fbsearch/recent_searches/'
      );

      const recent = {
        users: response.users?.map(u => FormatUtils.formatUser(u)) || [],
        hashtags: response.tags?.map(t => ({
          name: t.name,
          id: t.id,
          mediaCount: t.media_count
        })) || [],
        places: response.places?.map(p => ({
          locationId: p.location?.pk,
          name: p.title,
          city: p.location?.city
        })) || []
      };

      if (callback) return callback(null, recent);
      return recent;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  /**
   * Clear recent searches
   * @param {Function} callback - Callback function
   */
  async clearRecent(callback) {
    try {
      const response = await this.http.post(
        'https://www.instagram.com/api/v1/fbsearch/clear_search_history/'
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

module.exports = Search;