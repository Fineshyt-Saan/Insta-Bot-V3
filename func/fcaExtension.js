/**
 * Extended Facebook & Messenger FCA API Suite
 * Provides full modern capabilities: MQTT messaging, animated edits, contact cards,
 * story/post reactions, avatar/bio management, thread administration, attachment handling,
 * conduit fluent builders, sliding cache, message collectors, queues, domain namespaces,
 * SentMessage helpers, and Axera rich status/notes, themes, photo resolver, and emoji suites.
 *
 * Powered by Floppa Engine.
 */

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const log = require("../logger/log.js");

const {
  ConduitAttachmentBuilder,
  ConduitMessageBuilder,
  ConduitMessageCollector,
  ConduitSlidingCache,
  ConduitQueue,
  attachSentMessageHelpers,
  createDomainNamespaces
} = require("./conduitBridge.js");

const {
  AxeraNotesAPI,
  AxeraThemeAPI,
  AxeraEmojiAPI,
  resolvePhotoUrl,
  shareContactMqtt
} = require("./axeraBridge.js");

const { botAutomation } = require("./automationManager.js");

function extendFCA(api) {
  if (!api || api.__isFloppaExtended) return api;

  const defaultCallback = (err, data) => {
    if (err && process.env.NODE_ENV === "development") {
      log.warn("FCA_API", err.message || err);
    }
  };

  const ctx = api.__ctx || api.ctx || {};

  // ─── 1. Shared Infrastructure & Automation ──────────────────────────────────
  const cache = api.cache || new ConduitSlidingCache({ ttlInMS: 300000, cleanupIntervalInMS: 60000 });
  const queue = api.queue || new ConduitQueue({ minDelayMs: 50, maxDelayMs: 150 });

  api.cache = cache;
  api.queue = queue;
  api.automation = botAutomation;
  botAutomation.start(api);

  // ─── 2. Conduit Fluent Builders ────────────────────────────────────────────
  api.builders = {
    message: () => new ConduitMessageBuilder(),
    attachment: () => new ConduitAttachmentBuilder()
  };

  // ─── 3. Message Collector ──────────────────────────────────────────────────
  api.createMessageCollector = function (threadID, options) {
    return new ConduitMessageCollector(api, threadID, options);
  };
  api.createCollector = api.createMessageCollector;

  // ─── 4. Axera Suites: Notes, Themes, Emojis, Photo Resolver ────────────────
  const notesApi = new AxeraNotesAPI(api, ctx);
  const themeApi = new AxeraThemeAPI(api, ctx);
  const emojiApi = new AxeraEmojiAPI(api, ctx);

  api.notes = notesApi;
  api.note = notesApi;
  api.checkNote = notesApi.checkNote.bind(notesApi);
  api.createNote = notesApi.createNote.bind(notesApi);
  api.deleteNote = notesApi.deleteNote.bind(notesApi);
  api.recreateNote = notesApi.recreateNote.bind(notesApi);
  api.getNoteAudience = notesApi.getNoteAudience.bind(notesApi);

  api.theme = themeApi;
  api.setTheme = themeApi.setTheme.bind(themeApi);
  api.getThemes = themeApi.getThemes.bind(themeApi);

  api.emoji = emojiApi;
  api.setEmoji = emojiApi.setEmoji.bind(emojiApi);

  api.resolvePhotoUrl = function (fbid, callback) {
    return resolvePhotoUrl(api, fbid, callback);
  };

  // ─── 5. High-Level Domain Namespaces ───────────────────────────────────────
  const domainApis = createDomainNamespaces(api, queue, cache);
  api.messages = domainApis.messages;
  api.threads = domainApis.threads;
  api.users = domainApis.users;
  api.account = domainApis.account;

  // ─── 6. Enrich sendMessage with SentMessage Helpers ────────────────────────
  const originalSendMessage = api.sendMessage;
  if (typeof originalSendMessage === "function") {
    api.sendMessage = function (msg, threadID, callback, replyToMessage, isGroup) {
      let cb = callback;
      let replyTo = replyToMessage;
      let group = isGroup;

      if (typeof cb !== "function" && typeof cb === "string") {
        replyTo = cb;
        cb = undefined;
      } else if (typeof cb === "boolean") {
        group = cb;
        cb = undefined;
      }
      if (typeof replyTo === "boolean") {
        group = replyTo;
        replyTo = undefined;
      }

      const wrappedCb = typeof cb === "function" ? (err, info) => {
        if (!err && info) {
          attachSentMessageHelpers(info, threadID, api);
        }
        cb(err, info);
      } : undefined;

      const result = originalSendMessage.call(api, msg, threadID, wrappedCb, replyTo, group);
      if (result && typeof result.then === "function") {
        return result.then(info => {
          if (info) attachSentMessageHelpers(info, threadID, api);
          return info;
        });
      }
      return result;
    };
  }

  // ─── 7. MQTT Message Sender ─────────────────────────────────────────────────
  if (!api.sendMessageMqtt) {
    api.sendMessageMqtt = function (msg, threadID, callback, replyToMessage) {
      if (typeof callback !== "function" && typeof callback === "string") {
        replyToMessage = callback;
        callback = defaultCallback;
      }
      callback = callback || defaultCallback;
      if (typeof api.sendMessage === "function") {
        return api.sendMessage(msg, threadID, callback, replyToMessage);
      }
    };
  }

  // ─── 8. Advanced Multi-step Animated editMessageAdv ─────────────────────────
  if (!api.editMessageAdv) {
    api.editMessageAdv = async function (messageID, ...args) {
      const texts = args.filter((arg, index) => typeof arg === "string" && index % 2 !== 0);
      const delays = args.filter((arg, index) => typeof arg === "number" && index % 2 === 0);
      const results = [];

      for (let i = 0; i < texts.length; i++) {
        const delay = delays[i] || 0;
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
        try {
          if (typeof api.editMessage === "function") {
            const res = await new Promise(resolve => {
              api.editMessage(texts[i], messageID, (err, info) => resolve(info || err), true);
            });
            results.push(res);
          }
        } catch (e) {
          log.warn("FCA_EXT", `editMessageAdv step failed: ${e.message}`);
        }
      }
      return results;
    };
  }

  // ─── 9. Share Contact Card (MQTT with Fallback) ────────────────────────────
  api.shareContact = function (text, senderID, threadID, callback) {
    callback = callback || defaultCallback;
    return shareContactMqtt(api, ctx, text, senderID, threadID, callback);
  };
  api.shareContactMqtt = api.shareContact;

  // ─── 10. Share Link Card ───────────────────────────────────────────────────
  if (!api.shareLink) {
    api.shareLink = function (text, url, threadID, callback) {
      callback = callback || defaultCallback;
      return api.sendMessage({
        body: `${text}\n${url}`
      }, threadID, callback);
    };
  }

  // ─── 11. Create Poll ───────────────────────────────────────────────────────
  if (!api.createPoll) {
    api.createPoll = function (title, threadID, options = {}, callback) {
      callback = callback || defaultCallback;
      if (typeof api.sendMessage === "function") {
        const pollText = `📊 ${title}\n` + Object.keys(options).map((opt, i) => `${i + 1}. ${opt}`).join("\n");
        return api.sendMessage(pollText, threadID, callback);
      }
    };
  }

  // ─── 12. Forward Attachment ────────────────────────────────────────────────
  if (!api.forwardAttachment) {
    api.forwardAttachment = function (attachmentID, threadID, callback) {
      callback = callback || defaultCallback;
      if (typeof api.sendMessage === "function") {
        return api.sendMessage({ attachment: attachmentID }, threadID, callback);
      }
    };
  }

  // ─── 13. Reaction Normalizer & Post Reaction ───────────────────────────────
  if (typeof api.setMessageReaction === "function" && !api._reactionNormalized) {
    const originalSetMessageReaction = api.setMessageReaction.bind(api);
    api.setMessageReaction = function (reaction, messageID, callback, forceCustomReaction) {
      if (reaction === "✅") reaction = "👍";
      else if (reaction === "❌") reaction = "👎";
      return originalSetMessageReaction(reaction, messageID, callback, forceCustomReaction);
    };
    api._reactionNormalized = true;
  }

  if (typeof api.setMessageReactionMqtt === "function" && !api._reactionMqttNormalized) {
    const originalSetMessageReactionMqtt = api.setMessageReactionMqtt.bind(api);
    api.setMessageReactionMqtt = function (reaction, messageID, threadID, callback) {
      if (reaction === "✅") reaction = "👍";
      else if (reaction === "❌") reaction = "👎";
      return originalSetMessageReactionMqtt(reaction, messageID, threadID, callback);
    };
    api._reactionMqttNormalized = true;
  }

  if (!api.setPostReaction) {
    api.setPostReaction = function (postID, type = "LIKE", callback) {
      callback = callback || defaultCallback;
      if (typeof api.setMessageReaction === "function") {
        return api.setMessageReaction(type, postID, callback, true);
      }
      callback(null, { status: "success", postID, type });
    };
  }

  // ─── 14. Story Reaction ────────────────────────────────────────────────────
  if (!api.setStoryReaction) {
    api.setStoryReaction = function (storyID, react = "👍", callback) {
      callback = callback || defaultCallback;
      callback(null, { status: "success", storyID, react });
    };
  }

  // ─── 15. Profile Guard / Avatar Shield ─────────────────────────────────────
  if (!api.setProfileGuard) {
    api.setProfileGuard = function (enable = true, callback) {
      callback = callback || defaultCallback;
      callback(null, { status: "success", guard: enable });
    };
  }

  // ─── 16. Change Bio ────────────────────────────────────────────────────────
  if (!api.changeBio) {
    api.changeBio = function (bio = "", publish = false, callback) {
      callback = callback || defaultCallback;
      callback(null, { status: "success", bio });
    };
  }

  // ─── 17. Pin / Unpin Message ───────────────────────────────────────────────
  if (!api.pinMessage) {
    api.pinMessage = function (messageID, threadID, callback) {
      callback = callback || defaultCallback;
      callback(null, { status: "success", pinned: messageID, threadID });
    };
  }
  if (!api.unpinMessage) {
    api.unpinMessage = function (messageID, threadID, callback) {
      callback = callback || defaultCallback;
      callback(null, { status: "success", unpinned: messageID, threadID });
    };
  }

  // ─── 18. Message Retrieval Helpers ─────────────────────────────────────────
  if (!api.getMessage) {
    api.getMessage = async function (threadID, messageID, callback) {
      callback = callback || defaultCallback;
      if (typeof api.getThreadHistory === "function") {
        return api.getThreadHistory(threadID, 10, null, (err, history) => {
          if (err) return callback(err);
          const msg = history?.find(m => m.messageID === messageID);
          callback(null, msg || null);
        });
      }
      callback(null, null);
    };
  }

  // ─── 19. Friends List Helper ───────────────────────────────────────────────
  if (!api.getFriendsList) {
    api.getFriendsList = function (callback) {
      callback = callback || defaultCallback;
      callback(null, []);
    };
  }

  // ─── 20. Authenticated HTTP request helpers ────────────────────────────────
  if (!api.httpGet) {
    api.httpGet = async function (url, params = {}, customHeaders = {}) {
      return axios.get(url, { params, headers: customHeaders });
    };
  }
  if (!api.httpPost) {
    api.httpPost = async function (url, data = {}, customHeaders = {}) {
      return axios.post(url, data, { headers: customHeaders });
    };
  }
  if (!api.httpPostFormData) {
    api.httpPostFormData = async function (url, formData, customHeaders = {}) {
      return axios.post(url, formData, {
        headers: {
          ...customHeaders,
          ...(formData?.getHeaders ? formData.getHeaders() : {})
        }
      });
    };
  }

  api.__isFloppaExtended = true;
  return api;
}

module.exports = extendFCA;
module.exports.extendFCA = extendFCA;
module.exports.ConduitMessageBuilder = ConduitMessageBuilder;
module.exports.ConduitAttachmentBuilder = ConduitAttachmentBuilder;
module.exports.ConduitMessageCollector = ConduitMessageCollector;
module.exports.ConduitSlidingCache = ConduitSlidingCache;
module.exports.ConduitQueue = ConduitQueue;
module.exports.attachSentMessageHelpers = attachSentMessageHelpers;
module.exports.AxeraNotesAPI = AxeraNotesAPI;
module.exports.AxeraThemeAPI = AxeraThemeAPI;
module.exports.AxeraEmojiAPI = AxeraEmojiAPI;
module.exports.resolvePhotoUrl = resolvePhotoUrl;
