'use strict';

/**
 * tanvir143 - Instagram Chat API xr
 *
 * Usage:
 *
 *   const { login } = require('ica-by-tanvir');
 *
 *   const api = await login(cookies);               // cookie login
 *   const api = await login(cookies, { logLevel: 'debug' });  // with options
 *   login(cookies, (err, api) => { ... });           // callback style
 *
 *   api.listen((err, event) => { ... });
 *   api.sendMessage('Hello!', threadID);
 */

const InstagramChatAPI = require('./src/instagramChat');
const CookieUtils = require('./src/utils/cookies');
const { setOptions } = require('./src/utils/setOptions');

// ─────────────────────────────────────────────────────────────────────────────
// Build the api object from an authenticated client
// ─────────────────────────────────────────────────────────────────────────────

function resolveMediaArgs(a, b, c, d, defaultKind = 'photo') {
  let threadID, source, opts = {}, cb;
  const isMediaLike = (val) => {
    if (!val) return false;
    if (Buffer.isBuffer(val) || (val && val.buffer && Buffer.isBuffer(val.buffer))) return true;
    if (typeof val === 'object' && (val.path || val.url || typeof val.pipe === 'function' || val.stream)) return true;
    if (typeof val === 'string') {
      if (/^https?:\/\//i.test(val)) return true;
      if (val.includes('/') || val.includes('\\') || /\.(jpe?g|png|webp|gif|bmp|heic|avif|mp4|mov|webm|m4a|mp3|wav|ogg|aac|flac|opus)(\?|$)/i.test(val)) return true;
    }
    return false;
  };

  if (isMediaLike(a) && !isMediaLike(b)) {
    // Calling style: (source, threadID, [caption/opts], [cb/replyTarget])
    source = a;
    threadID = String(b);
    if (typeof c === 'function') {
      cb = c;
      opts = typeof d === 'object' && d !== null ? d : { replyToMessageID: d };
    } else {
      cb = typeof d === 'function' ? d : undefined;
      opts = typeof c === 'object' && c !== null ? c : { caption: typeof c === 'string' ? c : '', replyToMessageID: typeof d === 'string' || typeof d === 'number' ? d : undefined };
    }
  } else {
    // Calling style: (threadID, source, [opts/caption], [cb])
    threadID = String(a);
    source = b;
    if (typeof c === 'function') {
      cb = c;
      opts = {};
    } else if (typeof c === 'object' && c !== null) {
      opts = c;
      cb = typeof d === 'function' ? d : undefined;
    } else if (typeof c === 'string') {
      opts = { caption: c, replyToMessageID: typeof d === 'string' || typeof d === 'number' ? d : undefined };
      cb = typeof d === 'function' ? d : undefined;
    } else {
      cb = typeof d === 'function' ? d : undefined;
    }
  }

  return { threadID, source, opts, cb };
}

function buildApi(client) {
  return {
    // Identity
    getCurrentUserID: () => {
      const id = client.getCurrentUserID();
      return typeof id === "object" ? (id?.userID || id?.userId || String(id)) : String(id);
    },

    // Listening
    listen:        (cb)     => client.listen(cb),
    listenMqtt:    (cb)     => client.listen(cb),
    stopListening: ()       => client.stopListening(),
    on:            (...a)   => client.on(...a),
    off:           (...a)   => client.off(...a),
    once:          (...a)   => client.once(...a),

    // Messaging
    sendMessage:       (message, threadID, cb, reply) => {
      if (typeof cb === 'string' && !reply) {
        reply = cb;
        cb = undefined;
      }
      if (reply) {
        return client.sendMessage.reply(threadID, message, reply, cb);
      }
      return client.sendMessage.toThread(threadID, message, cb);
    },
    sendDirectMessage: (userID, message, cb)                      => client.sendDirectMessage(userID, message, cb),
    replyToMessage:    (threadID, message, replyToMessageID, cb)  => client.replyToMessage(threadID, message, replyToMessageID, cb),
    unsendMessage:     (messageID, cb)                            => client.unsendMessage(messageID, cb),

    // Media
    sendPhoto:        (a, b, c, d) => {
      const { threadID, source, opts, cb } = resolveMediaArgs(a, b, c, d, 'photo');
      const isUrl = typeof source === "string" && /^https?:\/\//i.test(source);
      if (isUrl) return client.sendPhotoFromUrl(threadID, source, opts, cb);
      return client.sendPhoto(threadID, source, opts, cb);
    },
    sendVideo:        (a, b, c, d) => {
      const { threadID, source, opts, cb } = resolveMediaArgs(a, b, c, d, 'video');
      const isUrl = typeof source === "string" && /^https?:\/\//i.test(source);
      if (isUrl) return client.sendVideoFromUrl(threadID, source, opts, cb);
      return client.sendVideo(threadID, source, opts, cb);
    },
    sendVoice:        (a, b, c, d) => {
      const { threadID, source, opts, cb } = resolveMediaArgs(a, b, c, d, 'voice');
      const isUrl = typeof source === "string" && /^https?:\/\//i.test(source);
      if (isUrl) return client.sendVoiceFromUrl(threadID, source, opts, cb);
      return client.sendVoice(threadID, source, opts, cb);
    },
    sendGIF:          (threadID, url, opts, cb)   => client.sendGIF(threadID, url, opts, cb),
    sendPhotoFromUrl: (threadID, url, opts, cb)   => client.sendPhotoFromUrl(threadID, url, opts, cb),
    sendVideoFromUrl: (threadID, url, opts, cb)   => client.sendVideoFromUrl(threadID, url, opts, cb),
    sendVoiceFromUrl: (threadID, url, opts, cb)   => client.sendVoiceFromUrl(threadID, url, opts, cb),

    // Standardized Media Aliases for Bot Engines & Message Helpers
    sendImage:        (source, threadID, caption = "", cb, reply) => {
      if (typeof caption === "function") {
        cb = caption;
        caption = "";
      }
      if (typeof cb !== "function" && reply === undefined && (typeof cb === "string" || typeof cb === "number")) {
        reply = cb;
        cb = undefined;
      }
      const isUrl = typeof source === "string" && /^https?:\/\//i.test(source);
      if (isUrl) return client.sendPhotoFromUrl(threadID, source, { caption, replyToMessageID: reply }, cb);
      return client.sendPhoto(threadID, source, { caption, replyToMessageID: reply }, cb);
    },
    sendAudio:        (source, threadID, cb, reply) => {
      if (typeof cb !== "function" && reply === undefined && (typeof cb === "string" || typeof cb === "number")) {
        reply = cb;
        cb = undefined;
      }
      const isUrl = typeof source === "string" && /^https?:\/\//i.test(source);
      if (isUrl) return client.sendVoiceFromUrl(threadID, source, { replyToMessageID: reply }, cb);
      return client.sendVoice(threadID, source, { replyToMessageID: reply }, cb);
    },

    // Reactions
    sendReaction:       (reaction, messageID, threadID, cb) => {
      if (typeof threadID === "function") {
        cb = threadID;
        threadID = undefined;
      }
      return client.sendReaction(reaction, messageID, threadID, cb);
    },
    removeReaction:     (messageID, threadID, cb)           => {
      if (typeof threadID === "function") {
        cb = threadID;
        threadID = undefined;
      }
      return client.removeReaction(messageID, threadID, cb);
    },
    setMessageReaction: (reaction, messageID, threadID, cb, force) => {
      if (typeof threadID === "function") {
        cb = threadID;
        threadID = undefined;
      } else if (typeof threadID === "boolean") {
        threadID = undefined;
      }
      if (typeof cb !== "function" && typeof threadID !== "string" && typeof threadID !== "number") {
        if (typeof cb === "function") threadID = undefined;
      }
      if (!reaction) return client.removeReaction(messageID, threadID, cb);
      return client.sendReaction(reaction, messageID, threadID, cb);
    },

    // Threads
    getThreadInfo:      (threadID, cb)                    => client.getThreadInfo(threadID, cb),
    getThreadHistory:   (threadID, amount, timestamp, cb) => client.getThreadHistory(threadID, amount, timestamp, cb),
    getInbox:           (opts, cb)                        => client.getInbox(opts, cb),
    getThreadList:      (opts, cb)                        => client.getInbox(opts, cb),
    getPendingRequests: (opts, cb)                        => client.getPendingRequests(opts, cb),
    searchThreads:      (query, opts, cb)                 => client.searchThreads(query, opts, cb),
    deleteThread:       (threadID, cb)                    => client.deleteThread(threadID, cb),
    approveRequest:     (threadID, cb)                    => client.approveRequest(threadID, cb),
    declineRequest:     (threadID, cb)                    => client.declineRequest(threadID, cb),
    muteThread:         (threadID, cb)                    => client.muteThread(threadID, cb),
    unmuteThread:       (threadID, cb)                    => client.unmuteThread(threadID, cb),
    changeThreadTitle:  (threadID, title, cb)             => client.changeThreadTitle(threadID, title, cb),
    setThreadTitle:     (threadID, title, cb)             => client.changeThreadTitle(threadID, title, cb),
    setTitle:           (title, threadID, cb)             => client.changeThreadTitle(threadID, title, cb),
    changeNickname:     (userID, threadID, nickname, cb)  => client.changeNickname(userID, threadID, nickname, cb),
    addUserToGroup:     (userIDs, threadID, cb)           => client.threadManagement.addUsers(threadID, userIDs, cb),
    leaveGroup:         (threadID, cb)                    => client.threadManagement.leave(threadID, cb),
    markAsRead:         (threadID, read, cb)              => client.markAsRead(threadID, read, cb),
    markAsUnread:       (threadID, cb)                    => client.markAsUnread(threadID, cb),

    // Typing
    sendTypingIndicator: (threadID, cb) => client.sendTypingIndicator(threadID, cb),
    stopTypingIndicator: (threadID, cb) => client.stopTypingIndicator(threadID, cb),

    // Users
    getUserInfo:           (userID, cb)        => client.getUserInfo(userID, cb),
    getUserInfoByUsername: (username, cb)       => client.getUserInfoByUsername(username, cb),
    searchUsers:           (query, opts, cb)    => client.searchUsers(query, opts, cb),

    // Stories
    getUserStories: (userID, cb)               => client.stories.getUserStories(userID, cb),
    getFeedStories: (opts, cb)                 => client.stories.getFeedStories(opts, cb),
    reactToStory:   (storyId, userId, emoji, cb)    => client.stories.react(storyId, userId, emoji, cb),
    replyToStory:   (storyId, userId, message, cb)  => client.stories.reply(storyId, userId, message, cb),

    // Live
    getLiveFeed:     (opts, cb)                 => client.live.getLiveFeed(opts, cb),
    sendLiveComment: (broadcastId, message, cb) => client.live.sendComment(broadcastId, message, cb),
    sendLiveHeart:   (broadcastId, count, cb)   => client.live.sendHeart(broadcastId, count, cb),

    // Search
    search:         (query, opts, cb) => client.search.users(query, opts, cb),
    searchHashtags: (query, opts, cb) => client.search.hashtags(query, opts, cb),
    searchPlaces:   (query, opts, cb) => client.search.places(query, opts, cb),
    searchReels:    (query, opts, cb) => client.searchReels(query, opts, cb),

    // Health / monitoring
    getHealth:      ()                => client.getHealth(),

    // Session
    getSession:  ()      => client.serialize(),
    loadSession: (state) => client.loadSession(state),

    // Auth
    logout:          (cb)                     => client.logout(cb),
    verifyTwoFactor: (code, identifier, cb)   => client.verifyTwoFactor(code, identifier, cb),

    // Options
    setOptions: (opts) => setOptions(opts),

    // Database & Scheduler
    initDatabase:      ()                          => client.initDatabase(),
    scheduleTask:      (name, cronExpr, task)      => client.scheduleTask(name, cronExpr, task),

    // Session persistence
    saveSession:       (filePath)                  => client.saveSession(filePath),
    loadSession:       (state)                     => client.loadSession(state),
    loadSessionFromFile:(filePath)                  => client.loadSessionFromFile(filePath),

    // Cookie utilities (also available as login.CookieUtils before logging in)
    CookieUtils,

    // Direct access to the underlying client instance for advanced use
    _client: client
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal login implementation (Ultra-Safe Safeguarded)
// ─────────────────────────────────────────────────────────────────────────────

async function _login(credentials, options) {
  const client = new InstagramChatAPI(options);

  const isCookies =
    typeof credentials === 'string' ||
    Array.isArray(credentials) ||
    (credentials && typeof credentials === 'object' && !credentials.password);

  try {
    if (isCookies) {
      const result = await client.loginWithCookies(credentials);
      if (result && typeof result === 'object' && result.success === false) {
        const errorMsg = result.error || result.message || 'Cookie login failed';
        throw new Error(errorMsg);
      }
    } else {
      const { email, username, password } = credentials || {};
      const result = await client.login(email || username, password);

      if (result && result.twoFactorRequired) {
        const err = new Error('Two-factor authentication required');
        err.twoFactorRequired  = true;
        err.twoFactorIdentifier = result.twoFactorIdentifier;
        err.verify = (code) => client.verifyTwoFactor(code, result.twoFactorIdentifier);
        throw err;
      }
    }
  } catch (err) {
    let errMsg = 'Unknown Error';
    try {
      if (err) {
        if (typeof err === 'string') {
          errMsg = err;
        } else {
          errMsg = err.message || err.error || JSON.stringify(err);
        }
      }
    } catch (e) {
      errMsg = 'Unknown Login Error';
    }

    const finalErr = new Error(errMsg);
    finalErr.error = errMsg;
    throw finalErr;
  }

  return buildApi(client);
}

// ─────────────────────────────────────────────────────────────────────────────
// login(credentials, [options], [callback])
// ─────────────────────────────────────────────────────────────────────────────

function login(credentials, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options  = {};
  }
  options = options || {};

  const promise = _login(credentials, options);

  if (typeof callback === 'function') {
    promise.then((api) => callback(null, api)).catch((err) => callback(err, null));
    return;
  }

  return promise;
}

// Everything a bot could need is attached directly to login
login.CookieUtils      = CookieUtils;
login.setOptions       = setOptions;
login.createClient     = (opts) => new InstagramChatAPI(opts);
login.buildApi         = buildApi;
login.resolveMediaArgs = resolveMediaArgs;

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

login.login = login;
login.default = login;
module.exports = login;
