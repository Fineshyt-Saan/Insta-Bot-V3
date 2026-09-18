'use strict';

/**
 * services/instagram/capabilities.js
 *
 * Instagram Capabilities Matrix:
 * Expresses what Instagram Direct supports vs what features require
 * special handling, adaptations, or graceful fallbacks.
 */

const CAPABILITIES = {
  // Direct Messaging
  DIRECT_MESSAGES: true,
  GROUP_CHATS: true,
  MESSAGE_REPLIES: true,
  MESSAGE_REACTIONS: true,
  UNSEND_MESSAGES: true,
  TYPING_INDICATOR: true,
  MARK_AS_READ: true,

  // Instagram-Native Power Features
  TEXT_EFFECTS: true,       // Love, fire, gift box, celebrate
  AVATAR_EFFECTS: true,     // Animated avatar reactions
  MUSIC_STICKERS: true,     // Instagram official catalogue search and music preview

  // Media Transport
  PHOTOS: true,             // JPEG, PNG, WEBP
  VIDEOS: true,             // MP4 (captions separated as Direct drops inline video captions)
  VOICE_NOTES: true,        // Voice clips (standalone)
  GIFS: true,               // Animated stickers/Giphy

  // Thread Management
  CHANGE_THREAD_TITLE: true,
  ADD_GROUP_PARTICIPANTS: true,
  LEAVE_GROUP: true,

  // Unsupported Facebook Features (Gracefully Handled)
  FACEBOOK_THEMES: false,          // Thread color themes (Facebook only)
  FACEBOOK_FRIEND_LIST: false,     // Friend lists (Facebook only)
  FACEBOOK_FBSTATE: false,         // c_user / xs fbstate cookies (Facebook only)
  FACEBOOK_CUSTOM_EMOJI: false     // Custom thread emoji picker (Facebook only)
};

function hasCapability(feature) {
  return Boolean(CAPABILITIES[feature]);
}

function getUnsupportedNotice(feature) {
  switch (feature) {
    case 'FACEBOOK_THEMES':
      return '🎨 Instagram Direct manages thread themes natively through the Instagram app settings. The !theme command is not applicable here.';
    case 'FACEBOOK_FRIEND_LIST':
      return '👥 Instagram uses Followers and Following rather than Facebook friend lists.';
    case 'FACEBOOK_FBSTATE':
      return '🔐 Instagram utilizes session cookies (sessionid, ds_user_id) rather than Facebook fbstate tokens.';
    case 'FACEBOOK_CUSTOM_EMOJI':
      return '😀 Instagram Direct uses heart / standard emojis rather than thread custom quick emojis.';
    default:
      return '⚠️ This feature is exclusive to Facebook Messenger and is not supported by Instagram Direct.';
  }
}

module.exports = {
  CAPABILITIES,
  hasCapability,
  getUnsupportedNotice
};
