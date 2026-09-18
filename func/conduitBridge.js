/**
 * Conduit Bridge for Floppa-Chatbot FCA
 * Incorporates fluent builders, multi-source attachment streaming,
 * message collectors, sliding TTL caches, thread concurrency queues,
 * high-level domain APIs, and SentMessage helpers from @TheophilusWorks/conduit.
 *
 * Fully integrated and adapted for Floppa Engine.
 */

const { EventEmitter } = require("events");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const axios = require("axios");

// ─── 1. Conduit Base Builder ──────────────────────────────────────────────────
class ConduitBaseBuilder {
  constructor(initialData) {
    this._data = initialData;
  }
  build() {
    return this._data;
  }
}

// ─── 2. Conduit Attachment Builder ───────────────────────────────────────────
class ConduitAttachmentBuilder extends ConduitBaseBuilder {
  constructor() {
    super([]);
    this._tempFiles = [];
  }

  from(input, headers = {}) {
    if (input instanceof Readable) {
      this._data.push(input);
      return this;
    }

    if (Buffer.isBuffer(input)) {
      this._data.push(Readable.from(input));
      return this;
    }

    if (typeof input === "string") {
      if (input.startsWith("http://") || input.startsWith("https://")) {
        this._data.push(this._streamFromURL(input, headers));
        return this;
      }
      if (fs.existsSync(input)) {
        this._data.push(fs.createReadStream(input));
        return this;
      }
    }

    return this;
  }

  fromUrl(url, headers = {}) {
    return this.from(url, headers);
  }

  fromPath(filePath) {
    return this.from(filePath);
  }

  fromBuffer(buffer) {
    return this.from(buffer);
  }

  fromStream(stream) {
    return this.from(stream);
  }

  _streamFromURL(url, headers = {}) {
    const ext = (() => {
      try {
        const parsed = new URL(url);
        return path.extname(parsed.pathname) || ".bin";
      } catch {
        return ".bin";
      }
    })();

    const tempFile = path.join(
      os.tmpdir(),
      `conduit_att_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    );
    this._tempFiles.push(tempFile);

    const outStream = new Readable({
      read() {}
    });

    axios({
      method: "GET",
      url,
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers
      }
    })
      .then(res => {
        const fileWriter = fs.createWriteStream(tempFile);
        res.data.pipe(fileWriter);

        fileWriter.on("finish", () => {
          const fileReadStream = fs.createReadStream(tempFile);
          fileReadStream.on("data", chunk => outStream.push(chunk));
          fileReadStream.on("end", () => {
            outStream.push(null);
            fs.remove(tempFile).catch(() => {});
          });
          fileReadStream.on("error", err => {
            outStream.destroy(err);
            fs.remove(tempFile).catch(() => {});
          });
        });

        fileWriter.on("error", err => {
          outStream.destroy(err);
          fs.remove(tempFile).catch(() => {});
        });
      })
      .catch(err => {
        outStream.destroy(err);
        fs.remove(tempFile).catch(() => {});
      });

    return outStream;
  }

  async save(filepath) {
    await fs.ensureDir(path.dirname(filepath));
    await Promise.all(
      this._data.map((stream, i) => {
        const dest = this._data.length === 1 ? filepath : `${filepath}.${i}`;
        return new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(dest);
          stream.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
          stream.on("error", reject);
        });
      })
    );
  }

  build() {
    return this._data.length === 1 ? this._data[0] : this._data;
  }
}

// ─── 3. Conduit Message Builder ──────────────────────────────────────────────
class ConduitMessageBuilder extends ConduitBaseBuilder {
  constructor() {
    super({
      body: "",
      mentions: [],
      attachment: []
    });
  }

  body(text) {
    this._data.body = String(text || "");
    return this;
  }

  text(text) {
    return this.body(text);
  }

  url(link) {
    this._data.url = link;
    return this;
  }

  attachment(file, headers) {
    if (file instanceof ConduitAttachmentBuilder) {
      const built = file.build();
      if (Array.isArray(built)) {
        this._data.attachment = (this._data.attachment || []).concat(built);
      } else if (built) {
        this._data.attachment = (this._data.attachment || []).concat([built]);
      }
      return this;
    }

    if (typeof file === "string" || Buffer.isBuffer(file) || file instanceof Readable) {
      const attBuilder = new ConduitAttachmentBuilder().from(file, headers);
      const built = attBuilder.build();
      if (built) {
        this._data.attachment = (this._data.attachment || []).concat(Array.isArray(built) ? built : [built]);
      }
      return this;
    }

    if (Array.isArray(file)) {
      this._data.attachment = (this._data.attachment || []).concat(file);
      return this;
    }

    return this;
  }

  sticker(id) {
    this._data.sticker = String(id);
    return this;
  }

  emoji(value, size = "small") {
    this._data.emoji = value;
    this._data.emojiSize = size;
    return this;
  }

  mention(tag, id, fromIndex = 0) {
    if (!this._data.mentions) this._data.mentions = [];
    this._data.mentions.push({
      tag: String(tag),
      id: String(id),
      fromIndex: typeof fromIndex === "number" ? fromIndex : undefined
    });
    return this;
  }

  replyTo(messageID) {
    this._data.replyToMessage = messageID;
    return this;
  }

  build() {
    const payload = { ...this._data };
    if (Array.isArray(payload.attachment) && payload.attachment.length === 1) {
      payload.attachment = payload.attachment[0];
    } else if (Array.isArray(payload.attachment) && payload.attachment.length === 0) {
      delete payload.attachment;
    }
    if (Array.isArray(payload.mentions) && payload.mentions.length === 0) {
      delete payload.mentions;
    }
    return payload;
  }

  async send(api, threadID, callback) {
    const payload = this.build();
    const replyTo = payload.replyToMessage;
    delete payload.replyToMessage;

    if (typeof api?.sendMessage === "function") {
      return new Promise((resolve, reject) => {
        api.sendMessage(payload, threadID, (err, info) => {
          if (typeof callback === "function") callback(err, info);
          if (err) reject(err);
          else resolve(info);
        }, replyTo);
      });
    }
    throw new Error("Invalid API object passed to ConduitMessageBuilder.send");
  }
}

// ─── 4. Conduit Message Collector ────────────────────────────────────────────
class ConduitMessageCollector extends EventEmitter {
  constructor(api, threadID, options = {}) {
    super();
    this.api = api;
    this.threadID = String(threadID);
    this.options = {
      filter: options.filter || (() => true),
      max: options.max || Infinity,
      maxMatches: options.maxMatches || options.max || Infinity,
      timeout: options.timeout || 60000,
      idle: options.idle || null,
      ...options
    };

    this.collected = new Map();
    this.ended = false;
    this.count = 0;

    this._timer = null;
    this._idleTimer = null;
    this._handler = this._onMessage.bind(this);

    this._init();
  }

  _init() {
    if (typeof this.options.timeout === "number" && this.options.timeout > 0) {
      this._timer = setTimeout(() => this.stop("timeout"), this.options.timeout);
    }
    this._resetIdleTimer();

    // Register on global event emitter if available
    const emitter = this.api?.emitter || global.GoatBot?.emitter || global.FloppaBot?.emitter;
    if (emitter && typeof emitter.on === "function") {
      emitter.on("message", this._handler);
      emitter.on("message_reply", this._handler);
    }
  }

  _resetIdleTimer() {
    if (typeof this.options.idle === "number" && this.options.idle > 0) {
      if (this._idleTimer) clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => this.stop("idle"), this.options.idle);
    }
  }

  async _onMessage(event) {
    if (this.ended || !event) return;
    if (String(event.threadID) !== this.threadID) return;

    this._resetIdleTimer();

    try {
      const pass = await Promise.resolve(this.options.filter(event));
      if (!pass) return;

      this.collected.set(event.messageID || `${Date.now()}_${Math.random()}`, event);
      this.count++;
      this.emit("collect", event);

      if (this.count >= this.options.maxMatches || this.count >= this.options.max) {
        this.stop("limit");
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  // Handle incoming event passed directly from bot listen loop
  handleEvent(event) {
    return this._onMessage(event);
  }

  stop(reason = "user") {
    if (this.ended) return;
    this.ended = true;

    if (this._timer) clearTimeout(this._timer);
    if (this._idleTimer) clearTimeout(this._idleTimer);

    const emitter = this.api?.emitter || global.GoatBot?.emitter || global.FloppaBot?.emitter;
    if (emitter && typeof emitter.removeListener === "function") {
      emitter.removeListener("message", this._handler);
      emitter.removeListener("message_reply", this._handler);
    }

    this.emit("end", this.collected, reason);
    this.removeAllListeners();
  }
}

// ─── 5. SentMessage Helpers ──────────────────────────────────────────────────
function attachSentMessageHelpers(info, threadID, api) {
  if (!info || typeof info !== "object" || info.__helpersAttached) return info;
  info.__helpersAttached = true;
  info.threadID = info.threadID || String(threadID || "");

  info.waitResponse = function (options = {}) {
    const timeout = typeof options === "number" ? options : (options.timeout || 30000);
    const filter = typeof options === "function" ? options : (options.filter || (() => true));

    return new Promise((resolve, reject) => {
      const collector = new ConduitMessageCollector(api, info.threadID, {
        max: 1,
        timeout,
        filter: (msg) => {
          if (msg.messageReply?.messageID === info.messageID) {
            return filter(msg);
          }
          return filter(msg);
        }
      });

      collector.on("collect", (msg) => resolve(msg));
      collector.on("end", (collected, reason) => {
        if (collected.size === 0) {
          if (options.rejectOnTimeout) {
            reject(new Error(`waitResponse timed out after ${timeout}ms`));
          } else {
            resolve(null);
          }
        }
      });
    });
  };

  info.collect = function (options = {}) {
    return new ConduitMessageCollector(api, info.threadID, options);
  };

  info.edit = function (text) {
    if (typeof api?.editMessage === "function") {
      return new Promise((resolve, reject) => {
        api.editMessage(text, info.messageID, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
    }
  };

  info.unsend = function () {
    if (typeof api?.unsendMessage === "function") {
      return new Promise((resolve, reject) => {
        api.unsendMessage(info.messageID, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
    }
  };

  info.react = function (reaction) {
    if (typeof api?.setMessageReaction === "function") {
      return new Promise((resolve, reject) => {
        api.setMessageReaction(reaction, info.messageID, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        }, true);
      });
    }
  };

  return info;
}

// ─── 6. Conduit Sliding Cache ────────────────────────────────────────────────
class ConduitSlidingCache {
  constructor(options = {}) {
    this.ttlInMS = options.ttlInMS || options.ttl || 300000; // 5 mins
    this.cleanupIntervalInMS = options.cleanupIntervalInMS || 60000; // 1 min
    this.cacheMap = new Map();
    this.inFlight = new Map();
    this._startCleanup();
  }

  async touch(key, initFn) {
    const cached = this.cacheMap.get(key);
    if (cached) {
      cached.expiresAt = Date.now() + this.ttlInMS;
      return cached.data;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    if (typeof initFn !== "function") return undefined;

    const promise = (async () => {
      try {
        const val = await initFn();
        this.set(key, val);
        return val;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  get(key) {
    const cached = this.cacheMap.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.cacheMap.delete(key);
      return undefined;
    }
    cached.expiresAt = Date.now() + this.ttlInMS;
    return cached.data;
  }

  set(key, data, customTtl) {
    const ttl = customTtl || this.ttlInMS;
    this.cacheMap.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
    return this;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.cacheMap.delete(key);
  }

  clear() {
    this.cacheMap.clear();
    this.inFlight.clear();
  }

  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, cache] of this.cacheMap) {
        if (cache.expiresAt <= now) {
          this.cacheMap.delete(key);
        }
      }
    }, this.cleanupIntervalInMS);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }
}

// ─── 7. Conduit Queue ────────────────────────────────────────────────────────
class ConduitQueue {
  constructor(options = {}) {
    this.minDelayMs = options.minDelayMs || 50;
    this.maxDelayMs = options.maxDelayMs || 150;
    this.switchDelayMinMs = options.switchDelayMinMs || 200;
    this.switchDelayMaxMs = options.switchDelayMaxMs || 400;
    this.queues = new Map();
    this.running = new Map();
    this.lastThreadID = null;
  }

  enqueue(threadID, job) {
    const tID = String(threadID || "global");
    return new Promise((resolve, reject) => {
      if (!this.queues.has(tID)) {
        this.queues.set(tID, []);
      }

      this.queues.get(tID).push(async () => {
        try {
          const res = await job();
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });

      if (!this.running.get(tID)) {
        this._run(tID);
      }
    });
  }

  async _run(threadID) {
    this.running.set(threadID, true);
    const queue = this.queues.get(threadID) || [];

    while (queue.length > 0) {
      if (this.lastThreadID !== null && this.lastThreadID !== threadID) {
        const switchDelay = this._randomRange(this.switchDelayMinMs, this.switchDelayMaxMs);
        if (switchDelay > 0) await new Promise(r => setTimeout(r, switchDelay));
      }

      this.lastThreadID = threadID;
      const job = queue.shift();
      if (job) {
        try {
          await job();
        } catch (err) {
          console.error("[ConduitQueue Error]:", err);
        }
      }

      if (queue.length > 0) {
        const delay = this._randomRange(this.minDelayMs, this.maxDelayMs);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
      }
    }

    this.queues.delete(threadID);
    this.running.delete(threadID);
  }

  _randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

// ─── 8. High-Level Domain Namespaces ─────────────────────────────────────────
function createDomainNamespaces(api, queue, cache) {
  const promisfy = (fn) => (...args) =>
    new Promise((resolve, reject) => {
      if (typeof fn !== "function") return reject(new Error("Underlying API method not found"));
      fn(...args, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

  return {
    messages: {
      send: (body, threadID, replyTo) => {
        const payload = body instanceof ConduitMessageBuilder ? body.build() : body;
        const op = () =>
          new Promise((resolve, reject) => {
            api.sendMessage(payload, threadID, (err, info) => {
              if (err) reject(err);
              else resolve(attachSentMessageHelpers(info, threadID, api));
            }, replyTo);
          });
        return queue ? queue.enqueue(threadID, op) : op();
      },
      reply: (body, messageID, threadID) => {
        const payload = body instanceof ConduitMessageBuilder ? body.build() : body;
        const op = () =>
          new Promise((resolve, reject) => {
            api.sendMessage(payload, threadID, (err, info) => {
              if (err) reject(err);
              else resolve(attachSentMessageHelpers(info, threadID, api));
            }, messageID);
          });
        return queue ? queue.enqueue(threadID, op) : op();
      },
      react: (reaction, messageID) => {
        if (typeof api.setMessageReaction === "function") {
          return new Promise((resolve, reject) => {
            api.setMessageReaction(reaction, messageID, (err, info) => {
              if (err) reject(err);
              else resolve(info);
            }, true);
          });
        }
      },
      unsend: (messageID) => {
        if (typeof api.unsendMessage === "function") {
          return new Promise((resolve, reject) => {
            api.unsendMessage(messageID, (err, info) => {
              if (err) reject(err);
              else resolve(info);
            });
          });
        }
      },
      edit: (text, messageID) => {
        if (typeof api.editMessage === "function") {
          return new Promise((resolve, reject) => {
            api.editMessage(text, messageID, (err, info) => {
              if (err) reject(err);
              else resolve(info);
            });
          });
        }
      }
    },

    threads: {
      get: (threadID) => {
        return cache.touch(`thread_${threadID}`, () => promisfy(api.getThreadInfo.bind(api))(threadID));
      },
      setName: (name, threadID) => {
        return promisfy(api.setTitle.bind(api))(name, threadID);
      },
      setColor: (color, threadID) => {
        return promisfy(api.changeThreadColor.bind(api))(color, threadID);
      },
      setEmoji: (emoji, threadID) => {
        return promisfy(api.changeThreadEmoji.bind(api))(emoji, threadID);
      },
      setNickname: (nickname, threadID, participantID) => {
        return promisfy(api.changeNickname.bind(api))(nickname, threadID, participantID);
      },
      addUser: (userID, threadID) => {
        return promisfy(api.addUserToGroup.bind(api))(userID, threadID);
      },
      removeUser: (userID, threadID) => {
        return promisfy(api.removeUserFromGroup.bind(api))(userID, threadID);
      },
      changeAdminStatus: (threadID, targetID, adminStatus) => {
        return promisfy(api.changeAdminStatus.bind(api))(threadID, targetID, adminStatus);
      }
    },

    users: {
      get: (userIDs) => {
        const uids = Array.isArray(userIDs) ? userIDs : [userIDs];
        const cacheKey = `users_${uids.sort().join("_")}`;
        return cache.touch(cacheKey, () => promisfy(api.getUserInfo.bind(api))(uids));
      },
      getAvatar: (userID, height = 500, width = 500) => {
        return `https://graph.facebook.com/${userID}/picture?height=${height}&width=${width}&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
      }
    },

    account: {
      getCurrentUserID: () => {
        return typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : null;
      },
      getAppState: () => {
        return typeof api.getAppState === "function" ? api.getAppState() : null;
      }
    }
  };
}

module.exports = {
  ConduitBaseBuilder,
  ConduitAttachmentBuilder,
  ConduitMessageBuilder,
  ConduitMessageCollector,
  ConduitSlidingCache,
  ConduitQueue,
  attachSentMessageHelpers,
  createDomainNamespaces
};
