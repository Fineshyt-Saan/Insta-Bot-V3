"use strict";

/**
 * auth.js — connect InstaBOT to your private ig-chat-api server.
 *
 * The heavy lifting (Instagram login, cookies, request signing, realtime MQTT)
 * lives on your own server. This file is the only bridge the bot needs: it
 * exposes the same `login(options, callback)` entry point and the same `api`
 * method surface the bot already uses, but every call travels to the server
 * over HTTP (RPC) and realtime events arrive over Server-Sent Events (SSE).
 *
 * ── Setup ────────────────────────────────────────────────────────────────
 *   In config.json:
 *     "server": {
 *       "url":   "https://ig.example.com",   // your ig-chat-api-server
 *       "token": "a-long-random-secret",     // must match IG_TOKEN on the server
 *       "timeout": 60000
 *     }
 *   …or via environment variables IG_API_SERVER / IG_API_TOKEN.
 *
 *   `selfListen` (top-level config, or `options.selfListen`) is forwarded to the
 *   server so the bot also receives its own outgoing messages. The server must
 *   allow it (IG_SELF_LISTEN=1 sets the default); per-client it is passed as
 *   `?selfListen=1` on the event stream.
 *
 * ── Notes ────────────────────────────────────────────────────────────────
 *   • `account.txt` is NOT used by the bot anymore; cookies live on the server.
 *   • Media sources (path / Buffer / stream / URL) are read locally by the bot
 *     and streamed to the server as bytes; URLs are forwarded untouched.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 * License: MIT
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { Readable } = require("stream");

// Keep-alive agents: reuse one socket for RPC calls instead of reconnecting on
// every command. maxSockets is generous since commands are low-volume.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
// Never hold the process open because of an idle pooled socket.
if (httpAgent.unref) httpAgent.unref();
if (httpsAgent.unref) httpsAgent.unref();

/** Every method the server can execute on the bot's behalf. */
const METHODS = [
	"getUserInfo", "getThreadInfo", "getThreadList", "getThreadHistory",
	"sendMessage", "sendImage", "sendAudio", "sendVideo",
	"sendTextEffect", "sendAvatarTextEffect", "sendMusic", "musicSearch",
	"sendTypingIndicator", "stopTypingIndicator", "setMessageReaction", "unsendMessage", "deleteMessage",
	"markAsRead", "markAsDelivered", "setTitle", "addUserToThread", "removeUserFromThread",
	"changeThreadMute", "changeBio", "changeProfilePicture", "changeAvatar",
	"getAppState", "setOptions", "logout"
];

// Raw media is base64-encoded (+33%) and wrapped in JSON, so keep it well under
// the server's request cap (IG_MAX_BODY_BYTES, default 8 MB). Override with
// IG_MAX_MEDIA_BYTES on the bot if the server allows larger bodies.
const MAX_MEDIA_BYTES = Math.max(256 * 1024, Number(process.env.IG_MAX_MEDIA_BYTES) || 5 * 1024 * 1024);

/* ── media encoding ────────────────────────────────────────────────────── */

function isReadable(value) {
	return value instanceof Readable ||
		(value && typeof value === "object" && typeof value.pipe === "function" && typeof value.on === "function");
}

function encodeBuffer(buffer, filename, contentType) {
	if (buffer.length > MAX_MEDIA_BYTES)
		throw new Error(`Media is ${Math.round(buffer.length / 1048576)} MB, above the ${Math.round(MAX_MEDIA_BYTES / 1048576)} MB limit`);
	return { __type: "buffer", base64: buffer.toString("base64"), filename: filename || null, contentType: contentType || null };
}

function drain(stream, callback) {
	const chunks = [];
	stream.on("data", chunk => chunks.push(chunk));
	stream.on("end", () => callback(null, Buffer.concat(chunks)));
	stream.on("error", callback);
}

/** Encode the argument list, draining streams and reading local files. */
function encodeArgs(args) {
	return Promise.all(args.map(arg => new Promise((resolve, reject) => {
		if (arg == null) return resolve(arg);
		if (Buffer.isBuffer(arg)) return resolve(encodeBuffer(arg));
		if (typeof arg === "string") {
			if (/^https?:\/\//i.test(arg)) return resolve(arg);
			try {
				if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
					return resolve(encodeBuffer(fs.readFileSync(arg), path.basename(arg)));
				}
			}
			catch (_) { /* not a local file */ }
			return resolve(arg);
		}
		if (isReadable(arg)) {
			return drain(arg, (error, buffer) => {
				if (error) return reject(error);
				resolve(encodeBuffer(buffer, arg.path ? path.basename(arg.path) : null));
			});
		}
		if (typeof arg === "object") {
			if (arg.stream != null) {
				return drain(arg.stream, (error, buffer) => {
					if (error) return reject(error);
					resolve(encodeBuffer(buffer, arg.filename || null, arg.contentType || null));
				});
			}
			if (arg.buffer != null && Buffer.isBuffer(arg.buffer)) {
				return resolve(encodeBuffer(arg.buffer, arg.filename, arg.contentType));
			}
			if (arg.path != null && typeof arg.path === "string") {
				try { return resolve(encodeBuffer(fs.readFileSync(arg.path), path.basename(arg.path))); }
				catch (error) { return reject(new Error(`Cannot read media path "${arg.path}": ${error.message}`)); }
			}
		}
		resolve(arg);
	})));
}

/* ── transport ─────────────────────────────────────────────────────────── */

/**
 * Find a node-style callback anywhere in the argument list. Some API methods
 * place it before a trailing argument (`sendMessage(form, threadID, cb, reply)`,
 * `sendImage(src, threadID, caption, cb, reply)`), so "last arg" is not enough.
 * Returns its index and the args with it removed, or { index: -1 }.
 */
function splitCallback(args) {
	for (let i = args.length - 1; i >= 0; i--) {
		if (typeof args[i] === "function") {
			const rest = args.slice(0, i).concat(args.slice(i + 1));
			return { index: i, args: rest };
		}
	}
	return { index: -1, args };
}

function createError(payload) {
	const error = new Error((payload && payload.message) || "ig-chat-api server request failed");
	if (payload && payload.error) error.error = payload.error;
	if (payload && payload.type) error.type = payload.type;
	return error;
}

function parseServer(server) {
	if (!server) throw new Error("A server URL is required (config.server.url or IG_API_SERVER).");
	let url = String(server).trim().replace(/\/+$/, "");
	if (!/^https?:\/\//i.test(url)) url = "http://" + url;
	return new URL(url);
}

function normalizeSettings(options) {
	const server = options.server || process.env.IG_API_SERVER;
	const token = options.token || process.env.IG_API_TOKEN;
	if (!token) throw new Error("A server token is required (config.server.token or IG_API_TOKEN).");
	return {
		base: parseServer(server),
		token,
		// The session id and its secret are never configured. We start with none
		// and adopt both from the server's /cookies reply (see login()). Starting
		// empty matters: a stale or inherited value must never be sent, or the bot
		// could be filed on someone else's session.
		botId: "",
		// Per-session secret. The shared token authenticates us to the SERVER;
		// this authorises us for OUR account only. Adopted from /cookies.
		sessionToken: "",
		timeout: Number(options.timeout) || 60000,
		selfListen: options.selfListen === true || options.selfListen === "true"
	};
}

/**
 * Headers that scope a request to this bot's own session. Only sent once the
 * server has told us what they are; before that an empty set lets the first
 * cookie push identify the account from the cookies alone.
 */
function sessionHeaders(settings) {
	const headers = {};
	if (settings.botId) headers["X-Bot-Id"] = settings.botId;
	if (settings.sessionToken) headers["X-Session-Token"] = settings.sessionToken;
	return headers;
}

function request(settings, method, args, callbackIndex) {
	return new Promise((resolve, reject) => {
		const target = settings.base;
		const lib = target.protocol === "https:" ? https : http;
		const payload = JSON.stringify({ method, args, callbackIndex: callbackIndex == null ? -1 : callbackIndex });

		const req = lib.request({
			protocol: target.protocol,
			hostname: target.hostname,
			port: target.port || (target.protocol === "https:" ? 443 : 80),
			path: "/rpc",
			method: "POST",
			// Reuse the TLS/TCP connection across calls: fewer handshakes, less
			// churn on the server, and one persistent socket per client.
			agent: target.protocol === "https:" ? httpsAgent : httpAgent,
			headers: Object.assign({
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(payload),
				Authorization: "Bearer " + settings.token
			}, sessionHeaders(settings)),
			timeout: settings.timeout
		}, res => {
			const chunks = [];
			res.on("data", chunk => chunks.push(chunk));
			res.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				let body;
				try { body = text ? JSON.parse(text) : {}; }
				catch (_) { return reject(new Error(`Invalid server response (${res.statusCode}): ${text.slice(0, 200)}`)); }
				if (res.statusCode === 401) return reject(new Error("Unauthorized: check your server token"));
				if (res.statusCode >= 400 || body.ok === false) return reject(createError(body.error || {}));
				resolve(body.result);
			});
		});

		req.on("timeout", () => {
			req.destroy(new Error(`Request timed out after ${settings.timeout}ms`));
		});
		req.on("error", err => {
			req.destroy();
			reject(err);
		});
		req.write(payload);
		req.end();
	});
}

/**
 * Hand the server this bot's cookies (POST /cookies) so a single-service
 * deployment can keep cookies on the bot (account.txt / IG_COOKIES) instead of
 * the server. Best-effort: a failure here is not fatal — the server may already
 * have its own cookies.
 *
 * The response carries `result.botId`: the session id the server assigned to
 * these cookies (the account's Instagram id). The bot adopts it for every later
 * call, so no id is ever configured on the bot.
 */
function pushCookies(settings, cookies) {
	return new Promise(resolve => {
		const target = settings.base;
		const lib = target.protocol === "https:" ? https : http;
		const payload = JSON.stringify({ cookies });
		const headers = Object.assign({
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(payload),
			Authorization: "Bearer " + settings.token
		}, sessionHeaders(settings));
		const req = lib.request({
			protocol: target.protocol,
			hostname: target.hostname,
			port: target.port || (target.protocol === "https:" ? 443 : 80),
			path: "/cookies",
			method: "POST",
			agent: target.protocol === "https:" ? httpsAgent : httpAgent,
			headers,
			timeout: settings.timeout
		}, res => {
			const chunks = [];
			res.on("data", chunk => chunks.push(chunk));
			res.on("end", () => {
				let botId = null;
				let sessionToken = null;
				try {
					const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
					const result = body && body.result;
					if (result && result.botId) botId = String(result.botId);
					if (result && result.sessionToken) sessionToken = String(result.sessionToken);
				}
				catch (_) { /* body optional */ }
				resolve({ status: res.statusCode, botId, sessionToken });
			});
		});
		req.on("timeout", () => req.destroy(new Error("cookie push timed out")));
		req.on("error", () => resolve({ error: true, botId: null }));
		req.write(payload);
		req.end();
	});
}

/* ── realtime (SSE) ────────────────────────────────────────────────────── */

class EventStream {
	constructor(settings, callback) {
		this.settings = settings;
		this.callback = callback;
		this.req = null;
		this.buffer = "";
		this.stopped = false;
		this.retry = 3000;
		this.baseRetry = 3000;
		this.maxRetry = 60000;
		this.attempts = 0;
		this.timer = null;
		this.lastChunkAt = 0;
		this.connectedAt = 0;
		this.stallTimer = null;
	}

	start() { this._connect(); this._armStallWatch(); }

	stop() {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		if (this.stallTimer) clearInterval(this.stallTimer);
		this.stallTimer = null;
		if (this.req) {
			try { this.req.destroy(); }
			catch (_) { /* ignore */ }
			this.req = null;
		}
	}

	// The server sends a `: ping` comment every ~25s. If nothing at all arrives
	// for much longer the stream is silently dead (common through proxies), so
	// drop it and reconnect.
	_isStalled(now) {
		if (this.stopped || !this.req) return false;
		// A stream that opened but has never delivered a byte (lastChunkAt=0) is
		// a silent hang too: a proxy can hold the socket open while the server
		// never writes. Age it from the moment the request was made, not from a
		// chunk that may never come.
		const since = this.lastChunkAt || this.connectedAt;
		return !!since && now - since > 90000;
	}

	_armStallWatch() {
		if (this.stallTimer) return;
		this.stallTimer = setInterval(() => {
			if (!this._isStalled(Date.now())) return;
			try { this.req.destroy(); } catch (_) { /* ignore */ }
			this.req = null;
			this._scheduleReconnect();
		}, 15000);
		if (this.stallTimer.unref) this.stallTimer.unref();
	}

	_connect() {
		if (this.stopped) return;
		const target = this.settings.base;
		const lib = target.protocol === "https:" ? https : http;
		// Reset the silence clock for this attempt. Stale timestamps from a
		// previous connection would otherwise make the stall watch kill a fresh
		// socket instantly and spin the reconnect loop.
		this.lastChunkAt = 0;
		this.connectedAt = Date.now();
		this.req = lib.request({
			protocol: target.protocol,
			hostname: target.hostname,
			port: target.port || (target.protocol === "https:" ? 443 : 80),
			path: "/events?botId=" + encodeURIComponent(this.settings.botId) + (this.settings.selfListen ? "&selfListen=1" : ""),
			method: "GET",
			headers: Object.assign({
				Accept: "text/event-stream",
				Authorization: "Bearer " + this.settings.token
			}, sessionHeaders(this.settings))
		}, res => {
			if (res.statusCode === 401) {
				this.callback(new Error("Unauthorized: check your server token and session"));
				return this.stop();
			}
			if (res.statusCode !== 200) {
				this.callback(new Error(`Event stream failed with status ${res.statusCode}`));
				return this._scheduleReconnect();
			}
			// A healthy stream resets the backoff so the next drop retries fast.
			this.attempts = 0;
			this.retry = this.baseRetry;
			res.setEncoding("utf8");
			res.on("data", chunk => { this.lastChunkAt = Date.now(); this._onData(chunk); });
			res.on("end", () => this._scheduleReconnect());
			res.on("error", error => {
				const msg = String(error && (error.message || error) || "");
				if (!/aborted|socket hang up|ECONNRESET|ETIMEDOUT/i.test(msg) && !this.stopped) {
					this.callback(error);
				}
				this._scheduleReconnect();
			});
		});
		this.req.on("error", error => {
			if (this.stopped) return;
			const msg = String(error && (error.message || error) || "");
			if (!/aborted|socket hang up|ECONNRESET|ETIMEDOUT/i.test(msg)) {
				this.callback(error);
			}
			this._scheduleReconnect();
		});
		this.req.end();
	}

	_onData(chunk) {
		this.buffer += chunk;
		let index;
		while ((index = this.buffer.indexOf("\n\n")) !== -1) {
			const raw = this.buffer.slice(0, index);
			this.buffer = this.buffer.slice(index + 2);
			this._onEvent(raw);
		}
		// Guard against a peer that never sends the delimiter.
		if (this.buffer.length > 8 * 1024 * 1024) this.buffer = "";
	}

	_onEvent(raw) {
		const dataLines = [];
		for (const line of raw.split(/\r?\n/)) {
			if (line.startsWith(":")) continue;
			if (line.startsWith("retry:")) {
				const value = Number(line.slice(6).trim());
				if (value > 0) { this.retry = value; this.baseRetry = value; }
				continue;
			}
			if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
		}
		if (!dataLines.length) return;
		let event;
		try { event = JSON.parse(dataLines.join("\n")); }
		catch (error) { return this.callback(new Error("Malformed event from server: " + error.message)); }
		this.callback(null, event);
	}

	_scheduleReconnect() {
		if (this.stopped || this.timer) return;
		// Exponential backoff, capped, so a long server outage does not hammer it.
		const delay = Math.min(this.maxRetry, this.retry * Math.pow(2, Math.min(5, this.attempts)));
		this.attempts++;
		this.timer = setTimeout(() => { this.timer = null; this._connect(); }, delay);
		if (this.timer.unref) this.timer.unref();
	}
}

/* ── public API ────────────────────────────────────────────────────────── */

/**
 * Connect to the ig-chat-api server. Signature-compatible with the private
 * ig-chat-api `login(options, callback)`.
 */
function login(options, callback) {
	if (typeof options === "function") { callback = options; options = {}; }
	options = options || {};

	let settings;
	try { settings = normalizeSettings(options); }
	catch (error) {
		if (typeof callback === "function") { callback(error); return Promise.reject(error); }
		return Promise.reject(error);
	}

	const api = {};
	for (const method of METHODS) api[method] = makeMethod(settings, method);

	api._recentMessageThreads = new Map();
	api._lastThreadID = null;

	const originalSetMessageReaction = api.setMessageReaction;
	api.setMessageReaction = function (reaction, messageID, threadID, callback, force) {
		let cb = callback;
		let tid = threadID;
		let f = force;
		if (typeof tid === "function") {
			cb = tid;
			tid = undefined;
			f = callback;
		} else if (typeof tid === "boolean") {
			f = tid;
			tid = undefined;
		}
		if (!tid) {
			tid = api._recentMessageThreads.get(String(messageID)) || api._lastThreadID || undefined;
		}
		if (!tid) {
			if (typeof cb === "function") cb(null);
			return Promise.resolve();
		}
		let p;
		try {
			const callArgs = [reaction, messageID, tid];
			if (typeof cb === "function") callArgs.push(cb);
			if (typeof f === "boolean") callArgs.push(f);
			p = originalSetMessageReaction(...callArgs);
		} catch (_) {
			p = Promise.resolve();
		}
		const safePromise = (p && typeof p.then === "function") ? p.catch(() => {}) : Promise.resolve();
		if (typeof cb === "function") {
			safePromise.then(r => cb(null, r), () => cb(null));
			return undefined;
		}
		return safePromise;
	};
	api.sendReaction = api.setMessageReaction;

	const originalSendMessage = api.sendMessage;
	api.sendMessage = function (...args) {
		if (args.length > 1 && (typeof args[1] === "string" || typeof args[1] === "number")) {
			api._lastThreadID = String(args[1]);
		}
		if (args.length === 4 && typeof args[2] !== "function" && args[3]) {
			return new Promise((resolve, reject) => {
				originalSendMessage(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), args[3]);
			});
		}
		if (args.length === 3 && (typeof args[2] === "string" || typeof args[2] === "number")) {
			return new Promise((resolve, reject) => {
				originalSendMessage(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), String(args[2]));
			});
		}
		return originalSendMessage.apply(this, args);
	};

	const originalSendImage = api.sendImage;
	api.sendImage = function (...args) {
		if (args.length > 1 && (typeof args[1] === "string" || typeof args[1] === "number")) {
			api._lastThreadID = String(args[1]);
		}
		if (args.length === 5 && typeof args[3] !== "function" && args[4]) {
			return new Promise((resolve, reject) => {
				originalSendImage(args[0], args[1], args[2], (err, res) => err ? reject(err) : resolve(res), args[4]);
			});
		}
		return originalSendImage.apply(this, args);
	};

	const originalSendAudio = api.sendAudio;
	api.sendAudio = function (...args) {
		if (args.length > 1 && (typeof args[1] === "string" || typeof args[1] === "number")) {
			api._lastThreadID = String(args[1]);
		}
		if (args.length === 4 && typeof args[2] !== "function" && args[3]) {
			return new Promise((resolve, reject) => {
				originalSendAudio(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), args[3]);
			});
		}
		if (args.length === 3 && (typeof args[2] === "string" || typeof args[2] === "number")) {
			return new Promise((resolve, reject) => {
				originalSendAudio(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), String(args[2]));
			});
		}
		return originalSendAudio.apply(this, args);
	};

	const originalSendVideo = api.sendVideo;
	api.sendVideo = function (...args) {
		if (args.length > 1 && (typeof args[1] === "string" || typeof args[1] === "number")) {
			api._lastThreadID = String(args[1]);
		}
		if (args.length === 4 && typeof args[2] !== "function" && args[3]) {
			return new Promise((resolve, reject) => {
				originalSendVideo(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), args[3]);
			});
		}
		if (args.length === 3 && (typeof args[2] === "string" || typeof args[2] === "number")) {
			return new Promise((resolve, reject) => {
				originalSendVideo(args[0], args[1], (err, res) => err ? reject(err) : resolve(res), String(args[2]));
			});
		}
		return originalSendVideo.apply(this, args);
	};

	api.sendPhoto = function (threadID, pathOrUrl, opts = {}, callback) {
		if (typeof opts === "function") {
			callback = opts;
			opts = {};
		}
		const caption = opts.caption || opts.text || "";
		const replyTo = opts.replyToMessageID || opts.replyTo || undefined;
		if (typeof callback === "function") {
			return api.sendImage(pathOrUrl, threadID, caption, callback, replyTo);
		}
		if (replyTo) {
			return api.sendImage(pathOrUrl, threadID, caption, undefined, replyTo);
		}
		return api.sendImage(pathOrUrl, threadID, caption);
	};

	// `sendTypingIndicator(threadID, cb)` returns a local stop function that
	// asks the server to clear the indicator (the server-side handle cannot
	// travel over the wire).
	api.sendTypingIndicator = function (threadID, callback) {
		const promise = encodeArgs([threadID]).then(encoded => request(settings, "sendTypingIndicator", encoded));
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return function stop(cb) {
			const p = encodeArgs([threadID]).then(encoded => request(settings, "stopTypingIndicator", encoded));
			if (typeof cb === "function") p.then(r => cb(null, r), e => cb(e));
			return p;
		};
	};

	api.getCurrentUserID = function () { return api._userID || null; };
	api.getAppState = function () { return []; };
	api.listen = api.listenMqtt = function (cb) {
		if (typeof cb !== "function") throw new Error("listenMqtt requires a callback");
		const stream = new EventStream(settings, (err, event) => {
			if (event) {
				const tid = event.threadID || event.threadId;
				if (tid) {
					api._lastThreadID = String(tid);
					const mid = event.messageID || event.messageId;
					if (mid) {
						api._recentMessageThreads.set(String(mid), String(tid));
						if (api._recentMessageThreads.size > 1000) {
							const firstKey = api._recentMessageThreads.keys().next().value;
							api._recentMessageThreads.delete(firstKey);
						}
					}
				}
			}
			cb(err, event);
		});
		stream.start();
		return function stop() { stream.stop(); };
	};

	let resolveFunc = () => { };
	let rejectFunc = () => { };
	const promise = new Promise((resolve, reject) => { resolveFunc = resolve; rejectFunc = reject; });

	// Optionally seed the server with this bot's cookies first, then connect.
	// `seed` resolves to the cookie value (an array/object/blob) or null.
	const seed = options.cookies != null ? Promise.resolve(options.cookies)
		: Array.isArray(options.appState) && options.appState.length ? Promise.resolve(options.appState)
		: null;

	// After seeding cookies the server needs a moment to log in to Instagram.
	// Poll getCurrentUserID until it answers, so a first connect does not fail
	// with "still logging in".
	function connect(attemptsLeft) {
		return request(settings, "getCurrentUserID", []).catch(error => {
			const message = String(error && (error.message || error) || "");
			const warming = /still logging in|not logged in|no cookies/i.test(message);
			if (warming && attemptsLeft > 0) {
				return new Promise(resolve => setTimeout(resolve, 3000)).then(() => connect(attemptsLeft - 1));
			}
			throw error;
		});
	}

	(seed ? seed : Promise.resolve(null))
		.then(value => pushCookies(settings, value))
		.then(outcome => {
			// Adopt what the server assigned to these cookies: the session id and
			// the per-session secret. Neither is configured on the bot; the server
			// derives the id from the account and hands back a secret that scopes
			// this bot to its own session.
			//
			// We always push, even with no cookies of our own: the reply carries
			// the secret for a session the SERVER already holds (accounts/<id>.txt
			// or IG_ACCOUNTS), which we cannot address otherwise.
			if (outcome && outcome.botId) settings.botId = outcome.botId;
			if (outcome && outcome.sessionToken) settings.sessionToken = outcome.sessionToken;
		}).catch(() => { })
		.then(() => connect(Math.max(1, Math.floor(settings.timeout / 3000))))
		.then(id => {
			api._userID = id != null ? String(id) : null;
			if (typeof callback === "function") callback(null, api);
			resolveFunc(api);
		})
		.catch(error => {
			if (typeof callback === "function") callback(error);
			rejectFunc(error);
		});

	return promise;
}

function makeMethod(settings, method) {
	return function (...args) {
		const { index, args: callArgs } = splitCallback(args);

		const promise = encodeArgs(callArgs).then(encoded => request(settings, method, encoded, index));
		if (index !== -1) {
			const callback = args[index];
			promise.then(result => callback(null, result), error => callback(error));
			return undefined;
		}
		return promise;
	};
}

module.exports = login;
module.exports.login = login;
module.exports.METHODS = METHODS.slice();
module.exports.EventStream = EventStream;
module.exports.pushCookies = pushCookies;
