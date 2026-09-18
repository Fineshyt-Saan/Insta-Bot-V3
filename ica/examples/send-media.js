/**
 * @fileoverview NKXICA - Sending Media
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Covers:
 *   - Photos from a local file
 *   - Photos from a remote URL
 *   - Videos from a local file
 *   - Videos from a remote URL
 *   - GIF from a Giphy URL or direct GIF URL
 *   - Voice/audio from a local file
 *   - Voice/audio from a remote URL (auto-converted to AAC via ffmpeg)
 *   - Sending media inline in a message object
 *
 * Requirements:
 *   - ffmpeg must be available on PATH for audio conversion
 *     (already provided in the Replit/Nix environment)
 */

'use strict';

const path = require('path');
const { login } = require('../index');

async function main() {
  const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';
  const api = await login(cookies, { logLevel: 'info' });

  const THREAD_ID = 'YOUR_THREAD_ID';

  // ── Photo from local file ───────────────────────────────────────────────────
  await api.sendPhoto(THREAD_ID, path.resolve('./assets/photo.jpg'));
  console.log('Sent local photo');

  // ── Photo from remote URL ───────────────────────────────────────────────────
  await api.sendPhotoFromUrl(THREAD_ID, 'https://example.com/image.jpg');
  console.log('Sent photo from URL');

  // ── Video from local file ───────────────────────────────────────────────────
  await api.sendVideo(THREAD_ID, path.resolve('./assets/clip.mp4'));
  console.log('Sent local video');

  // ── Video from remote URL ───────────────────────────────────────────────────
  await api.sendVideoFromUrl(THREAD_ID, 'https://example.com/video.mp4');
  console.log('Sent video from URL');

  // ── GIF ─────────────────────────────────────────────────────────────────────
  // Pass a Giphy share URL or a direct .gif URL
  await api.sendGIF(THREAD_ID, 'https://media.giphy.com/media/xT0BKL3yMa9GTt8j2o/giphy.gif');
  console.log('Sent GIF');

  // ── Voice/audio from local file ─────────────────────────────────────────────
  // Supported formats: .m4a, .aac, .mp3, .ogg, .wav (auto-converted to AAC)
  await api.sendVoice(THREAD_ID, path.resolve('./assets/voice.m4a'));
  console.log('Sent local voice message');

  // ── Voice/audio from remote URL ─────────────────────────────────────────────
  await api.sendVoiceFromUrl(THREAD_ID, 'https://example.com/audio.mp3');
  console.log('Sent voice from URL');

  // ── Inline media in a message ───────────────────────────────────────────────
  // sendMessage accepts a message object with an `attachment` key.
  await api.sendMessage({ body: 'Check this out', attachment: { photo: path.resolve('./assets/photo.jpg') } }, THREAD_ID);

  // Remote audio shorthand — triggers voiceFromUrl internally
  await api.sendMessage({ audio: 'https://example.com/audio.mp3' }, THREAD_ID);

  console.log('All media sent');
}

main().catch(console.error);