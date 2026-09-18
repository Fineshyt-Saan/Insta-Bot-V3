/**
 * @fileoverview NKXICA - Validation Utilities
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module ValidationUtils
 * @since 1.0.0
 */

class ValidationUtils {
  static isValidUserID(id) {
    if (!id) return false;
    const str = id.toString();
    return /^\d+$/.test(str) || /^u_\d+$/.test(str);
  }

  static isValidThreadID(id) {
    if (!id) return false;
    if (Array.isArray(id)) {
      return id.length > 0 && id.every(x => ValidationUtils.isValidThreadID(x));
    }
    const str = id.toString().trim();
    if (str.length === 0 || str.length > 128) return false;
    return /^[0-9A-Za-z_:.\-]+$/.test(str);
  }

  static isValidMessageID(id) {
    if (!id) return false;
    const str = id.toString();
    return str.length > 10;
  }

  static isValidUsername(username) {
    if (!username || typeof username !== 'string') return false;
    return /^[a-zA-Z0-9._]{1,30}$/.test(username);
  }

  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static isValidURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static sanitizeString(str, maxLength = 5000) {
    if (!str || typeof str !== 'string') return '';
    return str.substring(0, maxLength).trim();
  }

  static validateMessageBody(body, options = {}) {
    const maxLength = options.maxLength || 5000;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return { valid: false, error: 'Message body cannot be empty' };
    }
    if (body.length > maxLength) {
      return { valid: false, error: `Message body too long (max ${maxLength} characters)` };
    }
    const sanitized = this.sanitizeString(body, maxLength);
    return { valid: true, body: sanitized };
  }

  /**
   * Validate a message length without trimming/sanitising. Returns
   * { valid: boolean, error?: string }.
   */
  static validateMessageLength(text, maxLength = 5000) {
    if (typeof text !== 'string') {
      return { valid: false, error: 'Message must be a string' };
    }
    if (text.length === 0) {
      return { valid: false, error: 'Message cannot be empty' };
    }
    if (text.length > maxLength) {
      return { valid: false, error: `Message too long (max ${maxLength} characters)` };
    }
    return { valid: true };
  }

  /**
   * Validate a media file's size before upload. `sizeBytes` may be a number
   * or a fs.Stats object.
   */
  static validateMediaFileSize(sizeBytes, kind = 'image') {
    const limits = {
      image: 8 * 1024 * 1024,        // 8 MB
      video: 100 * 1024 * 1024,      // 100 MB
      audio: 25 * 1024 * 1024,       // 25 MB
      gif: 8 * 1024 * 1024
    };
    const max = limits[kind] || limits.image;
    const size = typeof sizeBytes === 'object' && sizeBytes !== null
      ? sizeBytes.size
      : Number(sizeBytes);
    if (!Number.isFinite(size) || size <= 0) {
      return { valid: false, error: 'Invalid file size' };
    }
    if (size > max) {
      return { valid: false, error: `File too large for ${kind} (${size} bytes, max ${max})` };
    }
    return { valid: true, size };
  }

  static validateThreadID(threadID) {
    if (!this.isValidThreadID(threadID)) {
      return { valid: false, error: 'Invalid thread ID' };
    }
    const id = Array.isArray(threadID) ? threadID.map(String) : threadID.toString().trim();
    return { valid: true, id };
  }

  static validateUserID(userID) {
    if (!this.isValidUserID(userID)) {
      return { valid: false, error: 'Invalid user ID' };
    }
    return { valid: true, id: userID.toString() };
  }

  static validateCallback(callback) {
    return typeof callback === 'function';
  }

  static parseMentions(text) {
    if (!text) return [];
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  }

  static extractUrls(text) {
    if (!text) return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }

  static isImageFile(filename) {
    if (!filename) return false;
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  }

  static isVideoFile(filename) {
    if (!filename) return false;
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext);
  }

  static isAudioFile(filename) {
    if (!filename) return false;
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac'].includes(ext);
  }

  static parseErrorResponse(error) {
    if (!error) return { message: 'Unknown error', code: null };
    
    if (error.response?.data) {
      const data = error.response.data;
      return {
        message: data.message || data.error_message || 'API Error',
        code: data.code || data.error_code || error.response.status,
        type: data.error_type || 'api_error'
      };
    }
    
    if (error.message) {
      return {
        message: error.message,
        code: error.code || null,
        type: error.type || 'error'
      };
    }
    
    return { message: 'Unknown error', code: null, type: 'unknown' };
  }
}

module.exports = ValidationUtils;