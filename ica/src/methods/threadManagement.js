/**
 * @fileoverview NKXICA - Thread Management API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module ThreadManagement
 * @since 1.0.0
 */

const ValidationUtils = require('../utils/validation');

class ThreadManagement {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.uuid = options.uuid;
  }

  async postThreadAction(url, form = {}) {
    const csrfToken = this.http.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Missing csrftoken cookie');
    }

    return this.http.postForm(url, {
      _uuid: this.uuid,
      _csrftoken: csrfToken,
      ...form
    });
  }

  // Delete/hide a thread
  async delete(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/hide/`,
        { use_unified_inbox: true }
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Approve pending message request
  async approveRequest(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/approve/`
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Decline pending message request
  async declineRequest(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/decline/`
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Mute thread
  async mute(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/mute/`
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Unmute thread
  async unmute(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/unmute/`
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Change thread title (group name)
  async changeTitle(threadID, title, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/update_title/`,
        { title }
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Change user nickname in thread
  async changeNickname(userID, threadID, nickname, callback) {
    try {
      const userValidation = ValidationUtils.validateUserID(userID);
      const threadValidation = ValidationUtils.validateThreadID(threadID);
      
      if (!userValidation.valid) {
        throw new Error(userValidation.error);
      }
      if (!threadValidation.valid) {
        throw new Error(threadValidation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${threadValidation.id}/update_nickname/`,
        {
          user_id: userValidation.id,
          nickname
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

  // Add users to group
  async addUsers(threadID, userIDs, callback) {
    try {
      const threadValidation = ValidationUtils.validateThreadID(threadID);
      if (!threadValidation.valid) {
        throw new Error(threadValidation.error);
      }

      const userIdsArray = Array.isArray(userIDs) ? userIDs : [userIDs];
      
      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${threadValidation.id}/add_user/`,
        { user_ids: JSON.stringify(userIdsArray) }
      );

      const success = response.status === 'ok';
      
      if (callback) return callback(null, success);
      return success;
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Leave thread/group
  async leave(threadID, callback) {
    try {
      const validation = ValidationUtils.validateThreadID(threadID);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await this.postThreadAction(
        `https://www.instagram.com/api/v1/direct_v2/threads/${validation.id}/leave/`
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

module.exports = ThreadManagement;