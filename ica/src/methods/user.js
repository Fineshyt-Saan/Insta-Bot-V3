/**
 * @fileoverview NKXICA - User API Methods
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module UserMethods
 * @since 1.0.0
 */

const FormatUtils = require('../utils/formatter');
const ValidationUtils = require('../utils/validation');

class UserMethods {
  constructor(httpClient) {
    this.http = httpClient;
  }

  // Get user info by ID
  async getInfo(userID, callback) {
    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.http.get(
        `https://www.instagram.com/api/v1/users/${validation.id}/info/`
      );

      const user = FormatUtils.formatUser(response.user);
      
      if (callback) return callback(null, user);
      return user;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get user info by username
  async getInfoByUsername(username, callback) {
    try {
      if (!ValidationUtils.isValidUsername(username)) {
        throw new Error('Invalid username');
      }

      // Search for user
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/users/search/?q=${encodeURIComponent(username)}&count=30`
      );

      const user = response.users?.find(u => u.username.toLowerCase() === username.toLowerCase());
      
      if (!user) {
        throw new Error('User not found');
      }

      const formatted = FormatUtils.formatUser(user);
      
      if (callback) return callback(null, formatted);
      return formatted;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Search users
  async search(query, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const limit = options.limit || 30;
      
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/users/search/?q=${encodeURIComponent(query)}&count=${limit}`
      );

      const users = response.users?.map(u => FormatUtils.formatUser(u)) || [];
      
      if (callback) return callback(null, users);
      return users;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get multiple users info
  async getMultiple(userIDs, callback) {
    try {
      const results = [];
      
      for (const userID of userIDs) {
        try {
          const user = await this.getInfo(userID);
          results.push({ userID, success: true, user });
          // Add delay between batch requests to avoid rate limiting
          if (userIDs.indexOf(userID) < userIDs.length - 1) {
            await this.sleep(1500);
          }
        } catch (error) {
          results.push({ userID, success: false, error: error.message });
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

  // Get followers (limited, requires additional permissions)
  async getFollowers(userID, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const maxId = options.cursor || '';
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/friendships/${validation.id}/followers/?count=${options.limit || 50}${maxId ? `&max_id=${maxId}` : ''}`
      );

      const users = response.users?.map(u => FormatUtils.formatUser(u)) || [];
      
      const result = {
        users,
        hasMore: !!response.next_max_id,
        cursor: response.next_max_id
      };
      
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Get following (limited, requires additional permissions)
  async getFollowing(userID, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      const validation = ValidationUtils.validateUserID(userID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const maxId = options.cursor || '';
      const response = await this.http.get(
        `https://www.instagram.com/api/v1/friendships/${validation.id}/following/?count=${options.limit || 50}${maxId ? `&max_id=${maxId}` : ''}`
      );

      const users = response.users?.map(u => FormatUtils.formatUser(u)) || [];
      
      const result = {
        users,
        hasMore: !!response.next_max_id,
        cursor: response.next_max_id
      };
      
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }
}

module.exports = UserMethods;