/**
 * @fileoverview NKXICA - Send Media API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module SendMedia
 * @since 1.0.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const axios = require('axios');
const CryptoUtils = require('../utils/crypto');
const ValidationUtils = require('../utils/validation');

async function _resolveBufferAndMime(input, defaultMime = 'image/jpeg') {
  if (Buffer.isBuffer(input)) {
    return { buffer: input, mimeType: defaultMime };
  }
  if (input && input.buffer && Buffer.isBuffer(input.buffer)) {
    return { buffer: input.buffer, mimeType: input.mimeType || input.mimetype || defaultMime };
  }
  if (input && typeof input.pipe === 'function') {
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      input.on('data', chunk => chunks.push(chunk));
      input.on('end', () => resolve(Buffer.concat(chunks)));
      input.on('error', reject);
    });
    return { buffer, mimeType: input.mimeType || input.mimetype || defaultMime };
  }
  if (input && typeof input === 'object' && input.stream && typeof input.stream.pipe === 'function') {
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      input.stream.on('data', chunk => chunks.push(chunk));
      input.stream.on('end', () => resolve(Buffer.concat(chunks)));
      input.stream.on('error', reject);
    });
    return { buffer, mimeType: input.mimeType || input.mimetype || defaultMime };
  }
  if (input && typeof input === 'object' && typeof input.path === 'string') {
    return { buffer: fs.readFileSync(input.path), mimeType: input.mimeType || defaultMime, filePath: input.path };
  }
  if (typeof input === 'string') {
    return { buffer: fs.readFileSync(input), mimeType: defaultMime, filePath: input };
  }
  throw new Error('Invalid media input: expected file path, URL, Buffer, or Stream');
}

/**
 * Stat a local media file and reject early if it exceeds the per-kind limit
 * defined in ValidationUtils.validateMediaFileSize. Throws a descriptive
 * error before the file is slurped into memory.
 */
function _assertMediaSize(filePath, kind) {
  let size;
  if (Buffer.isBuffer(filePath)) {
    size = filePath.length;
  } else if (filePath && typeof filePath === 'object' && filePath.buffer && Buffer.isBuffer(filePath.buffer)) {
    size = filePath.buffer.length;
  } else if (typeof filePath === 'string') {
    if (/^https?:\/\//i.test(filePath)) return 1;
    try {
      size = fs.statSync(filePath).size;
    } catch (err) {
      throw new Error(`Cannot stat media file ${filePath}: ${err.message}`);
    }
  } else if (filePath && typeof filePath === 'object' && typeof filePath.path === 'string') {
    try {
      size = fs.statSync(filePath.path).size;
    } catch (err) {
      throw new Error(`Cannot stat media file ${filePath.path}: ${err.message}`);
    }
  } else {
    // Stream or dynamic object - size checked after reading
    size = 1;
  }
  const check = ValidationUtils.validateMediaFileSize(size, kind);
  if (!check.valid) throw new Error(check.error);
  return size;
}

class SendMedia {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.deviceId = options.deviceId;
    this.uuid = options.uuid;
  }

  buildBroadcastForm(threadID, form = {}) {
    const csrfToken = this.http.getCsrfToken();
    if (!csrfToken) {
      throw new Error('Missing csrftoken cookie');
    }

    const uid = this.http.getCookieValue('ds_user_id');
    const clientContext = CryptoUtils.generateUUID();
    const strThreadID = String(threadID || '');
    const hasColon = strThreadID.includes(':') && !strThreadID.startsWith('t_');
    const isRecipientUsers = form.recipientType === 'recipient_users' || form.recipientUsers || hasColon;
    const recipientField = isRecipientUsers ? 'recipient_users' : 'thread_ids';
    let recipientValue;
    if (form.recipientUsers) {
      recipientValue = JSON.stringify(form.recipientUsers);
    } else if (hasColon) {
      const uids = strThreadID.split(':').filter(Boolean);
      recipientValue = JSON.stringify([uids]);
    } else if (isRecipientUsers) {
      recipientValue = JSON.stringify([[String(threadID)]]);
    } else {
      recipientValue = JSON.stringify(Array.isArray(threadID) ? threadID.map(String) : [String(threadID)]);
    }

    const cleanForm = { ...form };
    delete cleanForm.recipientType;
    delete cleanForm.recipientUsers;

    return {
      form: {
        action: 'send_item',
        send_attribution: 'direct_thread',
        [recipientField]: recipientValue,
        client_context: clientContext,
        mutation_token: clientContext,
        offline_threading_id: clientContext,
        device_id: this.deviceId,
        _csrftoken: csrfToken,
        _uuid: this.uuid,
        _uid: uid,
        ...cleanForm
      },
      clientContext
    };
  }

  extractInfo(response, threadID, uploadID, clientContext) {
    const payload = response?.payload;
    const metadata = Array.isArray(response?.message_metadata) ? response.message_metadata[0] : null;
    const messageID = payload?.item_id || metadata?.item_id || clientContext;
    if (messageID) {
      this.http.rememberMessageThread(messageID, threadID);
    }
    return {
      threadID,
      messageID,
      uploadID,
      timestamp: Date.now().toString(),
      clientContext
    };
  }

  async uploadPhotoBuffer(buffer, uploadId, mimeType) {
    const uploadName = `${uploadId}_0_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const headers = {
      'X-FB-Photo-Waterfall-ID': CryptoUtils.generateUUID(),
      'X-Entity-Type': mimeType,
      'Offset': '0',
      'X-Instagram-Rupload-Params': JSON.stringify({
        retry_context: JSON.stringify({
          num_step_auto_retry: 0,
          num_reupload: 0,
          num_step_manual_retry: 0
        }),
        media_type: '1',
        upload_id: uploadId.toString(),
        xsharing_user_ids: JSON.stringify([]),
        image_compression: JSON.stringify({
          lib_name: 'moz',
          lib_version: '3.1.m',
          quality: '80'
        })
      }),
      'X-Entity-Name': uploadName,
      'X-Entity-Length': buffer.byteLength.toString(),
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
      'Accept-Encoding': 'gzip'
    };

    return this.http.post(`https://i.instagram.com/rupload_igphoto/${uploadName}`, buffer, { headers });
  }

  async uploadVideoBuffer(buffer, uploadId, mimeType, ruploadParams) {
    const uploadName = `${uploadId}_0_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const headers = {
      'X-IG-Connection-Type': 'WIFI',
      'X-IG-Capabilities': '3brTvx0=',
      'Accept-Encoding': 'gzip',
      'X-Instagram-Rupload-Params': JSON.stringify(ruploadParams),
      'X-FB-Video-Waterfall-ID': CryptoUtils.generateUUID(),
      'X-Entity-Type': mimeType,
      'Offset': '0',
      'X-Entity-Name': uploadName,
      'X-Entity-Length': buffer.byteLength.toString(),
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString()
    };

    return this.http.post(`https://i.instagram.com/rupload_igvideo/${uploadName}`, buffer, { headers });
  }

  async finishVideoUpload(uploadId, sourceType, video = null) {
    const csrfToken = this.http.getCsrfToken();
    const userId = this.http.getCookieValue('ds_user_id');
    const form = {
      timezone_offset: '0',
      _csrftoken: csrfToken,
      source_type: sourceType,
      _uid: userId,
      device_id: this.deviceId,
      _uuid: this.uuid,
      upload_id: uploadId
    };

    if (video) {
      form.length = video.length;
      form.clips = JSON.stringify([{ length: video.length, source_type: sourceType }]);
      form.poster_frame_index = 0;
      form.audio_muted = false;
    }

    const signed = CryptoUtils.generateSignature(JSON.stringify(form));
    const qs = video ? '?video=1' : '';
    return this.http.post(
      `https://www.instagram.com/api/v1/media/upload_finish/${qs}`,
      signed,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Retry-Context': JSON.stringify({
            num_step_auto_retry: 0,
            num_reupload: 0,
            num_step_manual_retry: 0
          })
        }
      }
    );
  }

  // Send photo to thread
  async photo(threadID, imagePath, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    try {
      if (typeof imagePath === 'string' && /^https?:\/\//i.test(imagePath)) {
        return this.photoFromUrl(threadID, imagePath, options, callback);
      }

      _assertMediaSize(imagePath, 'image');
      const resolved = await _resolveBufferAndMime(imagePath, 'image/jpeg');
      const imageBuffer = resolved.buffer;
      const uploadId = Date.now().toString();
      const mimeType = resolved.filePath
        ? this._getMimeType(resolved.filePath, 'image/jpeg')
        : (options.mimeType || options.mimetype || resolved.mimeType || 'image/jpeg');

      // Re-assert media size on the slurped buffer
      const check = ValidationUtils.validateMediaFileSize(imageBuffer.length, 'image');
      if (!check.valid) throw new Error(check.error);

      const uploadResponse = await this.uploadPhotoBuffer(imageBuffer, uploadId, mimeType);

      if (uploadResponse && uploadResponse.status !== 'ok') {
        throw new Error(uploadResponse.message || 'Failed to upload photo');
      }

      const { form: messageData, clientContext } = this.buildBroadcastForm(threadID, {
        allow_full_aspect_ratio: options.allowFullAspect !== false,
        view_mode: options.viewMode || options.view_mode || 'permanent',
        recipientType: options.recipientType,
        recipientUsers: options.recipientUsers
      });

      const captionText = options.text || options.caption;
      if (captionText) {
        messageData.text = captionText;
      }
      const replyTarget = options.replyToMessageID || options.replyTo;
      if (replyTarget) {
        messageData.replied_to_target_id = replyTarget.toString();
        messageData.replied_to_action_source = 'swipe_reply';
        messageData.reply_to_item_id = replyTarget.toString();
      }
      messageData.upload_id = uploadId;
      messageData.view_mode = options.viewMode || options.view_mode || 'permanent';

      let response;
      try {
        response = await this.http.postForm(
          'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/configure_photo/',
          messageData
        );
      } catch (postErr) {
        if (replyTarget) {
          delete messageData.replied_to_target_id;
          delete messageData.replied_to_action_source;
          delete messageData.reply_to_item_id;
          response = await this.http.postForm(
            'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/configure_photo/',
            messageData
          );
        } else {
          throw postErr;
        }
      }

      if ((!response || response.status !== 'ok') && replyTarget) {
        delete messageData.replied_to_target_id;
        delete messageData.replied_to_action_source;
        delete messageData.reply_to_item_id;
        try {
          response = await this.http.postForm(
            'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/configure_photo/',
            messageData
          );
        } catch (_) {}
      }

      if ((!response || response.status !== 'ok') && messageData.thread_ids && String(threadID).startsWith('t_s_')) {
        const cleanId = String(threadID).replace(/^t_s_/, '');
        messageData.thread_ids = JSON.stringify([cleanId]);
        try {
          response = await this.http.postForm(
            'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/configure_photo/',
            messageData
          );
        } catch (_) {}
      }

      if (response && response.status === 'ok') {
        const info = this.extractInfo(response, threadID, uploadId, clientContext);
        
        if (callback) return callback(null, info);
        return info;
      }

      throw new Error((response && response.message) || 'Failed to send photo');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Upload audio buffer to Instagram's direct-message audio endpoint
  async uploadAudioBuffer(buffer, uploadId, durationMs) {
    const uploadName = `${uploadId}_0_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const headers = {
      'X-Entity-Type': 'audio/mp4',
      'Offset': '0',
      'X-Instagram-Rupload-Params': JSON.stringify({
        upload_id: uploadId,
        media_type: '11',
        upload_media_duration_ms: durationMs.toString()
      }),
      'X-Entity-Name': uploadName,
      'X-Entity-Length': buffer.byteLength.toString(),
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
      'Accept-Encoding': 'gzip'
    };
    return this.http.post(`https://i.instagram.com/rupload_igdirect/${uploadName}`, buffer, { headers });
  }

  // Get real audio duration in ms via ffprobe; falls back to WAV header parse or 1000ms
  _getAudioDurationMs(filePath, buffer) {
    if (typeof filePath === 'string' && fs.existsSync(filePath)) {
      try {
        const out = execFileSync('ffprobe', [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', filePath
        ], { timeout: 10000 }).toString().trim();
        const secs = parseFloat(out);
        if (!isNaN(secs) && secs > 0) return Math.round(secs * 1000);
      } catch (_) {}
    }
    return this._getMediaDurationMs(filePath, buffer);
  }

  // Send voice/audio message
  async voice(threadID, audioPath, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    try {
      if (typeof audioPath === 'string' && /^https?:\/\//i.test(audioPath)) {
        return this.voiceFromUrl(threadID, audioPath, options, callback);
      }

      _assertMediaSize(audioPath, 'audio');
      const resolved = await _resolveBufferAndMime(audioPath, 'audio/mp4');
      const audioBuffer = resolved.buffer;
      const uploadId = Date.now().toString();

      // Re-assert media size on the slurped buffer
      const check = ValidationUtils.validateMediaFileSize(audioBuffer.length, 'audio');
      if (!check.valid) throw new Error(check.error);

      let durationMs = 1000;
      if (resolved.filePath) {
        durationMs = this._getAudioDurationMs(resolved.filePath, audioBuffer);
      } else {
        durationMs = this._getMediaDurationMs(audioPath, audioBuffer);
      }

      // Step 1: upload to rupload_igdirect
      const uploadResponse = await this.uploadAudioBuffer(audioBuffer, uploadId, durationMs);
      if (uploadResponse && uploadResponse.status !== 'ok') {
        throw new Error(uploadResponse.message || 'Failed to upload audio');
      }

      // Step 2: broadcast as voice_media
      const waveform = options.waveform || Array.from(
        { length: 50 },
        (_, i) => Math.round((Math.sin(i * (Math.PI / 25)) * 0.5 + 0.5) * 10000) / 10000
      );

      const { form: messageData, clientContext } = this.buildBroadcastForm(threadID, {
        upload_id: uploadId,
        waveform: JSON.stringify(waveform),
        waveform_sampling_frequency_hz: options.waveformFrequency || 10,
        view_mode: options.viewMode || options.view_mode || 'permanent'
      });

      const replyTarget = options.replyToMessageID || options.replyTo;
      if (replyTarget) {
        messageData.replied_to_target_id = replyTarget.toString();
        messageData.replied_to_action_source = 'swipe_reply';
        messageData.reply_to_item_id = replyTarget.toString();
      }

      const voiceUrls = [
        'https://i.instagram.com/api/v1/direct_v2/threads/broadcast/voice_media/',
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/voice_media/'
      ];

      let response;
      let lastVoiceError;
      for (const voiceUrl of voiceUrls) {
        try {
          response = await this.http.postForm(voiceUrl, messageData);
          if (response.status === 'ok') break;
          throw new Error(response.message || 'Failed to send voice message');
        } catch (err) {
          lastVoiceError = err;
          if (!/404|400|None|not supported/i.test(err.message)) throw err;
        }
      }

      if (response && response.status === 'ok') {
        const info = this.extractInfo(response, threadID, uploadId, clientContext);
        if (callback) return callback(null, info);
        return info;
      }

      throw lastVoiceError || new Error('Failed to send voice message');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Send video
  async video(threadID, videoPath, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    try {
      if (typeof videoPath === 'string' && /^https?:\/\//i.test(videoPath)) {
        return this.videoFromUrl(threadID, videoPath, options, callback);
      }

      _assertMediaSize(videoPath, 'video');
      const resolved = await _resolveBufferAndMime(videoPath, 'video/mp4');
      const videoBuffer = resolved.buffer;
      const uploadId = Date.now().toString();

      // Re-assert media size on the slurped buffer
      const check = ValidationUtils.validateMediaFileSize(videoBuffer.length, 'video');
      if (!check.valid) throw new Error(check.error);

      const mimeType = resolved.filePath
        ? this._getMimeType(resolved.filePath, 'video/mp4')
        : (options.mimeType || options.mimetype || resolved.mimeType || 'video/mp4');
      const durationMs = resolved.filePath
        ? this._getMediaDurationMs(resolved.filePath, videoBuffer)
        : this._getMediaDurationMs(videoPath, videoBuffer);

      const uploadResponse = await this.uploadVideoBuffer(videoBuffer, uploadId, mimeType, {
        retry_context: JSON.stringify({
          num_step_auto_retry: 0,
          num_reupload: 0,
          num_step_manual_retry: 0
        }),
        media_type: '2',
        upload_id: uploadId,
        upload_media_duration_ms: durationMs.toString(),
        direct_v2: '1'
      });

      if (uploadResponse && uploadResponse.status !== 'ok') {
        throw new Error(uploadResponse.message || 'Failed to upload video');
      }

      // upload_finish is needed for posts/stories; for DMs it's non-fatal
      try {
        await this.finishVideoUpload(uploadId, '2', { length: durationMs / 1000 });
      } catch (_) {}

      const { form: messageData, clientContext } = this.buildBroadcastForm(threadID, {
        upload_id: uploadId,
        video_result: '',
        upload_media_duration_ms: durationMs.toString(),
        sampled: typeof options.sampled !== 'undefined' ? options.sampled : true,
        view_mode: options.viewMode || options.view_mode || 'permanent'
      });

      const captionText = options.text || options.caption;
      if (captionText) {
        messageData.text = captionText;
      }
      const replyTarget = options.replyToMessageID || options.replyTo;
      if (replyTarget) {
        messageData.replied_to_target_id = replyTarget.toString();
        messageData.replied_to_action_source = 'swipe_reply';
        messageData.reply_to_item_id = replyTarget.toString();
      }
      messageData.view_mode = options.viewMode || options.view_mode || 'permanent';

      const response = await this.http.postForm(
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/configure_video/',
        messageData
      );

      if (response.status === 'ok') {
        const info = this.extractInfo(response, threadID, uploadId, clientContext);
        
        if (callback) return callback(null, info);
        return info;
      }

      throw new Error(response.message || 'Failed to send video');
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  _extractGiphyId(url) {
    const match = url.match(/giphy\.com\/(?:media|gifs)\/(?:[^/]+-)?([A-Za-z0-9]+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  _buildGiphyImages(giphyId) {
    const base = `https://media.giphy.com/media/${giphyId}`;
    return {
      fixed_height: {
        url: `${base}/giphy.gif`,
        webp: `${base}/giphy.webp`,
        mp4: `${base}/giphy.mp4`,
        height: '200',
        width: '356',
        size: '0',
        mp4_size: '0',
        webp_size: '0'
      },
      fixed_height_downsampled: {
        url: `${base}/200_d.gif`,
        webp: `${base}/200_d.webp`,
        height: '200',
        width: '356',
        webp_size: '0'
      },
      fixed_height_still: {
        url: `${base}/200_s.gif`,
        height: '200',
        width: '356'
      },
      fixed_width: {
        url: `${base}/giphy.gif`,
        webp: `${base}/giphy.webp`,
        mp4: `${base}/giphy.mp4`,
        height: '200',
        width: '356',
        size: '0',
        mp4_size: '0',
        webp_size: '0'
      },
      fixed_width_downsampled: {
        url: `${base}/200w_d.gif`,
        webp: `${base}/200w_d.webp`,
        height: '200',
        width: '356',
        webp_size: '0'
      },
      fixed_width_still: {
        url: `${base}/200w_s.gif`,
        height: '200',
        width: '356'
      },
      original: {
        url: `${base}/giphy.gif`,
        webp: `${base}/giphy.webp`,
        mp4: `${base}/giphy.mp4`,
        height: '400',
        width: '356',
        size: '0',
        mp4_size: '0',
        webp_size: '0',
        frames: '0',
        hash: ''
      }
    };
  }

  // Send GIF/animated media
  async gif(threadID, gifUrl, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    try {
      const giphyId = this._extractGiphyId(gifUrl);
      const extraFields = giphyId
        ? { animated_media_id: giphyId }
        : { animated_media_id: gifUrl };

      const { form: messageData, clientContext } = this.buildBroadcastForm(threadID, extraFields);

      const urls = [
        'https://i.instagram.com/api/v1/direct_v2/threads/broadcast/animated_media/',
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/animated_media/'
      ];

      let response;
      let lastError;
      for (const url of urls) {
        try {
          response = await this.http.postForm(url, messageData);
          if (response.status === 'ok') break;
          throw new Error(response.message || 'Failed to send GIF');
        } catch (err) {
          lastError = err;
          if (!/404|400/.test(err.message)) throw err;
        }
      }

      if (response && response.status === 'ok') {
        const info = this.extractInfo(response, threadID, null, clientContext);
        if (callback) return callback(null, info);
        return info;
      }

      // Fallback: download GIF and upload as photo
      const downloadUrl = gifUrl;
      const tempPath = path.join(os.tmpdir(), `ig_gif_${Date.now()}.gif`);
      try {
        const dlResponse = await axios.get(downloadUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        fs.writeFileSync(tempPath, Buffer.from(dlResponse.data));
        const info = await this.photo(threadID, tempPath, options);
        try { fs.unlinkSync(tempPath); } catch (_) {}
        if (callback) return callback(null, { ...info, _gifFallback: true });
        return { ...info, _gifFallback: true };
      } catch (dlErr) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
        throw lastError || dlErr;
      }
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }
  }

  // Download an image from a URL then send it as a DM photo
  async photoFromUrl(threadID, imageUrl, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    const ext = (imageUrl.match(/\.(jpe?g|png|webp|gif|bmp|heic|avif)/i) || [])[1] || 'jpg';
    const tempPath = path.join(os.tmpdir(), `ig_photo_${Date.now()}.${ext}`);

    try {
      const dlResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': '*/*'
        },
        maxRedirects: 5
      });

      fs.writeFileSync(tempPath, Buffer.from(dlResponse.data));
      const result = await this.photo(threadID, tempPath, options);
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (callback) return callback(error);
      throw error;
    }
  }

  // Download an audio file from a URL then send it as a DM voice message
  async voiceFromUrl(threadID, audioUrl, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    // Try to detect extension from URL path first, then fall back to Content-Type sniffing
    const urlPath = audioUrl.split('?')[0];
    const extFromUrl = (urlPath.match(/\.(m4a|mp3|wav|ogg|aac|flac|opus)/i) || [])[1];

    // Also check mime_type query param (e.g. TikTok CDN URLs use ?mime_type=audio_mpeg)
    const mimeTypeParam = (audioUrl.match(/[?&]mime_type=([^&]+)/i) || [])[1];
    const MIME_TO_EXT = {
      'audio_mpeg': 'mp3', 'audio/mpeg': 'mp3',
      'audio_mp4': 'm4a',  'audio/mp4': 'm4a',
      'audio_wav': 'wav',  'audio/wav': 'wav',
      'audio_ogg': 'ogg',  'audio/ogg': 'ogg',
      'audio_aac': 'aac',  'audio/aac': 'aac'
    };
    const extFromParam = mimeTypeParam ? MIME_TO_EXT[decodeURIComponent(mimeTypeParam).toLowerCase()] : null;

    // Placeholder — will be refined from Content-Type header after the request
    let ext = extFromUrl || extFromParam || null;
    const tempBase = path.join(os.tmpdir(), `ig_audio_${Date.now()}`);
    let tempPath = tempBase + (ext ? `.${ext}` : '.m4a');

    try {
      const dlResponse = await axios.get(audioUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': '*/*'
        },
        maxRedirects: 5
      });

      // Sniff Content-Type from response headers if we still don't have an extension
      if (!ext) {
        const ct = (dlResponse.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        ext = MIME_TO_EXT[ct] || 'm4a';
        tempPath = `${tempBase}.${ext}`;
      }

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempPath);
        dlResponse.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        dlResponse.data.on('error', reject);
      });

      // Instagram voice messages prefer AAC/m4a — convert if ffmpeg is available
      let uploadPath = tempPath;
      let convertedPath = null;
      if (path.extname(tempPath).toLowerCase() !== '.m4a') {
        convertedPath = `${tempBase}_converted.m4a`;
        try {
          await new Promise((resolve, reject) => {
            execFile('ffmpeg', [
              '-y', '-i', tempPath,
              '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '1',
              convertedPath
            ], (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
          uploadPath = convertedPath;
        } catch (_) {
          // If ffmpeg is unavailable or fails, fallback to uploading original audio directly
          uploadPath = tempPath;
          convertedPath = null;
        }
      }

      const result = await this.voice(threadID, uploadPath, options);
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (convertedPath) try { fs.unlinkSync(convertedPath); } catch (_) {}
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (callback) return callback(error);
      throw error;
    }
  }

  // Download a video from a URL (streaming) then send it as a DM video
  async videoFromUrl(threadID, videoUrl, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') {
      callback = null;
    }

    const ext = (videoUrl.match(/\.(mp4|mov|webm)/i) || [])[1] || 'mp4';
    const tempPath = path.join(os.tmpdir(), `ig_video_${Date.now()}.${ext}`);

    try {
      // Stream the remote video to a temp file
      const dlResponse = await axios.get(videoUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': '*/*'
        },
        maxRedirects: 5
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempPath);
        dlResponse.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        dlResponse.data.on('error', reject);
      });

      const result = await this.video(threadID, tempPath, options);
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (callback) return callback(null, result);
      return result;
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      if (callback) return callback(error);
      throw error;
    }
  }

  _getMimeType(filePath, defaultType = 'application/octet-stream') {
    if (!filePath || typeof filePath !== 'string') return defaultType;
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };
    return mimeTypes[ext] || defaultType;
  }

  _getMediaDurationMs(filePath, buffer) {
    if (typeof filePath === 'string') {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.wav' && buffer && buffer.length >= 44) {
        const byteRate = buffer.readUInt32LE(28);
        const dataSize = buffer.readUInt32LE(40);
        if (byteRate > 0) {
          return Math.max(1000, Math.round((dataSize / byteRate) * 1000));
        }
      }
    }
    // Conservative fallback when we cannot inspect container metadata locally.
    return 1000;
  }
}

module.exports = SendMedia;