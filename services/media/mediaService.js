'use strict';

/**
 * services/media/mediaService.js
 *
 * High-level media service providing:
 * - Safe media downloading with timeouts and size limits.
 * - MIME detection and extension resolution.
 * - Temporary file allocation with automatic cleanup registration.
 * - Stream and Buffer handling.
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const { detectMediaKind, prepareMediaSource } = require('../../platforms/instagram/media/handler');

class MediaService {
  constructor(tempDir = path.resolve(process.cwd(), 'temp')) {
    this.tempDir = tempDir;
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Generates a unique temporary file path with the specified extension.
   */
  createTempPath(ext = '.tmp') {
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const filename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${cleanExt}`;
    return path.join(this.tempDir, filename);
  }

  /**
   * Downloads a remote URL to a temporary local file.
   */
  async downloadUrl(url, options = {}) {
    const timeout = options.timeout || 30000;
    const maxBytes = options.maxBytes || 50 * 1024 * 1024; // 50MB default limit

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const contentType = response.headers['content-type'] || '';
      let ext = '.jpg';
      if (/mp4|webm|quicktime/i.test(contentType)) ext = '.mp4';
      else if (/mp3|mpeg|wav|ogg|audio/i.test(contentType)) ext = '.mp3';
      else if (/png/i.test(contentType)) ext = '.png';
      else if (/gif/i.test(contentType)) ext = '.gif';

      const tempPath = this.createTempPath(ext);
      const writer = fs.createWriteStream(tempPath);

      let downloadedBytes = 0;
      return await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            response.data.destroy();
            writer.destroy();
            fs.unlink(tempPath).catch(() => {});
            reject(new Error(`File size exceeded maximum limit of ${maxBytes / 1024 / 1024}MB`));
          }
        });

        response.data.pipe(writer);
        writer.on('finish', () => resolve(tempPath));
        writer.on('error', err => {
          fs.unlink(tempPath).catch(() => {});
          reject(err);
        });
      });
    } catch (err) {
      logger.error('MediaService download error', { url, error: err.message });
      throw err;
    }
  }

  /**
   * Safely deletes a file without throwing if it does not exist.
   */
  async cleanup(filePath) {
    if (!filePath) return;
    try {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
      }
    } catch (_) {}
  }

  /**
   * Cleans all temporary files older than maxAgeMs (defaults to 1 hour).
   */
  async cleanExpired(maxAgeMs = 3600000) {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        const full = path.join(this.tempDir, file);
        try {
          const stat = await fs.stat(full);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.unlink(full);
            cleaned++;
          }
        } catch (_) {}
      }
      return cleaned;
    } catch (err) {
      logger.warn('Media cleanup scan failed', { error: err.message });
      return 0;
    }
  }
}

const mediaService = new MediaService();

module.exports = {
  MediaService,
  mediaService
};
