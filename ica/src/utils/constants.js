/**
 * NKXICA Constants Module
 * Centralised API endpoints and configuration values.
 */

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── Instagram API Base URLs ──────────────────────────────────────────────────

const BASE_URL = 'https://www.instagram.com';
const API_V1   = `${BASE_URL}/api/v1`;

// ─── Direct Messaging Endpoints ───────────────────────────────────────────────

const ENDPOINTS = {
  // Authentication
  LOGIN:               `${API_V1}/accounts/login/`,
  LOGOUT:              `${API_V1}/accounts/logout/`,
  TWO_FACTOR_LOGIN:    `${API_V1}/accounts/two_factor_login/`,
  CHECK_USERNAME:      `${API_V1}/accounts/check_username/`,

  // Direct messaging (broadcast)
  BROADCAST_TEXT:      `${API_V1}/direct_v2/threads/broadcast/text/`,
  BROADCAST_LINK:      `${API_V1}/direct_v2/threads/broadcast/link/`,
  BROADCAST_MEDIA:     `${API_V1}/direct_v2/threads/broadcast/upload_and_send_direct_media/`,
  BROADCAST_PHOTO:     `${API_V1}/direct_v2/threads/broadcast/upload_and_send_direct_media/`,
  BROADCAST_VIDEO:     `${API_V1}/direct_v2/threads/broadcast/upload_and_send_direct_media/`,
  BROADCAST_VOICE:     `${API_V1}/direct_v2/threads/broadcast/audio/`,
  BROADCAST_GIF:       `${API_V1}/direct_v2/threads/broadcast/animated_media/`,
  BROADCAST_REACTION:  `${API_V1}/direct_v2/threads/broadcast/reaction/`,
  BROADCAST_UNSEND:    `${API_V1}/direct_v2/threads/broadcast/unsend/`,

  // Thread management
  THREAD_INFO:         (threadID) => `${API_V1}/direct_v2/threads/${threadID}/`,
  THREAD_DELETE:       (threadID) => `${API_V1}/direct_v2/threads/${threadID}/hide/`,
  THREAD_MUTE:         (threadID) => `${API_V1}/direct_v2/threads/${threadID}/mute/`,
  THREAD_UNMUTE:       (threadID) => `${API_V1}/direct_v2/threads/${threadID}/unmute/`,
  THREAD_APPROVE:      (threadID) => `${API_V1}/direct_v2/threads/${threadID}/approve/`,
  THREAD_DECLINE:      (threadID) => `${API_V1}/direct_v2/threads/${threadID}/decline/`,
  THREAD_TITLE:        (threadID) => `${API_V1}/direct_v2/threads/${threadID}/update_title/`,
  THREAD_HISTORY:      (threadID) => `${API_V1}/direct_v2/threads/${threadID}/items/`,
  MARK_ITEM_SEEN:      (threadID, itemID) => `${API_V1}/direct_v2/threads/${threadID}/items/${itemID}/seen/`,

  // Inbox
  INBOX:               `${API_V1}/direct_v2/inbox/`,
  PENDING_INBOX:       `${API_V1}/direct_v2/pending_inbox/`,
  THREAD_SEARCH:       `${API_V1}/direct_v2/ranked_recipients/`,

  // User info
  USER_INFO:           (userID) => `${API_V1}/users/${userID}/info/`,
  USER_BY_USERNAME:    (username) => `${BASE_URL}/${username}/?__a=1&__d=dis`,
  USER_SEARCH:         `${API_V1}/users/search/`,

  // Typing
  TYPING_INDICATOR:    `${API_V1}/direct_v2/threads/broadcast/indicate_activity/`,

  // Mark read / unread
  MARK_THREAD_SEEN:    (threadID) => `${API_V1}/direct_v2/threads/${threadID}/items/seen/`,

  // Nickname
  UPDATE_TITLE:        (threadID) => `${API_V1}/direct_v2/threads/${threadID}/update_title/`,
  UPDATE_NICKNAME:     `${API_V1}/direct_v2/threads/update_title/`,

  // Media upload
  RUPLOAD_PHOTO:       'https://i.instagram.com/rupload_igphoto/',
  RUPLOAD_VIDEO:       'https://i.instagram.com/rupload_igvideo/',

  // Stories
  STORY_FEED:          `${API_V1}/feed/reels_tray/`,
  STORY_ITEMS:         (userID) => `${API_V1}/feed/user/${userID}/reel_media/`,

  // Search
  SEARCH_USERS:        `${API_V1}/users/search/`,
  SEARCH_TOPICS:       `${API_V1}/fbsearch/topsearch/`,

  // Live
  LIVE_CREATE:         `${API_V1}/live/create/`,
  LIVE_START:          (broadcastID) => `${API_V1}/live/${broadcastID}/start/`,
  LIVE_END:            (broadcastID) => `${API_V1}/live/${broadcastID}/end/`,

  // MQTT
  MQTT_HOST:           'wss://edge-chat.instagram.com/chat',
};

// ─── Trusted cookie domains ───────────────────────────────────────────────────

const TRUSTED_COOKIE_DOMAINS = new Set([
  '.instagram.com',
  'instagram.com',
  '.facebook.com',
  'facebook.com',
  'i.instagram.com',
]);

module.exports = { getRandom, ENDPOINTS, BASE_URL, API_V1, TRUSTED_COOKIE_DOMAINS };