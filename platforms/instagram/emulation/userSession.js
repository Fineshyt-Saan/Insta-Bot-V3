"use strict";

/**
 * platforms/instagram/emulation/userSession.js
 *
 * User-Session Emulation Module for Meta / Instagram Direct:
 * Speaks the same HTTP/GraphQL and MQTT protocols the browser client uses,
 * providing programmatic access to messages, threads, reactions, typing indicators,
 * and more — with full type definitions.
 */

const EventEmitter = require("events");
const { BrowserSession } = require("./browserSession");
const { GraphQLClient } = require("./graphQLClient");
const InstagramMQTTClient = require("../../../ica/src/mqtt/instagramRealtime");

class UserSessionEmulation extends EventEmitter {
	constructor(credentials = {}, options = {}) {
		super();
		this.options = Object.assign({
			listenEvents: true,
			autoReconnect: true,
			selfListen: false
		}, options);

		this.browserSession = new BrowserSession(Object.assign({
			cookies: credentials.appState || credentials.cookies || credentials.cookie || credentials
		}, options));

		this.graphQLClient = new GraphQLClient(this.browserSession, options);
		this.mqttClient = null;
		this.userID = this.browserSession.userId || null;
		this.username = null;
		this.isConnected = false;
		this.commands = new Map();
		this.recentMessageThreads = new Map();
		this.lastThreadID = null;

		this._initMqtt();
	}

	_initMqtt() {
		const cookieHeader = this.browserSession.getCookieString("https://www.instagram.com/");
		const allCookies = this.browserSession.jar.serializeSync().cookies || [];

		this.mqttClient = new InstagramMQTTClient({
			userId: this.browserSession.userId,
			sessionId: this.browserSession.sessionId,
			csrftoken: this.browserSession.csrfToken,
			igDid: allCookies.find(c => c.key === "ig_did")?.value,
			userAgent: this.browserSession.userAgent,
			cookies: cookieHeader,
			http: {
				get: (url) => this.graphQLClient.request("GET", url)
			}
		});

		this.mqttClient.on("connected", (data) => {
			this.isConnected = true;
			this.emit("connected", data);
			this.emit("ready", { userID: this.userID, api: this });
		});

		this.mqttClient.on("disconnected", () => {
			this.isConnected = false;
			this.emit("disconnected");
		});

		this.mqttClient.on("error", (err) => this.emit("error", err));

		this.mqttClient.on("event", (event) => this._routeEvent(event));
	}

	_routeEvent(event) {
		if (!event) return;
		const tid = event.threadID || event.threadId;
		const mid = event.messageID || event.messageId;

		if (tid) {
			this.lastThreadID = String(tid);
			if (mid) {
				this.recentMessageThreads.set(String(mid), String(tid));
				if (this.recentMessageThreads.size > 2000) {
					const first = this.recentMessageThreads.keys().next().value;
					this.recentMessageThreads.delete(first);
				}
			}
		}

		this.emit("event", event);

		if (event.type === "message" || event.type === "message_reply") {
			this.emit("messageCreate", event);

			if (this.options.commandPrefix && event.body && event.body.startsWith(this.options.commandPrefix)) {
				const bodyNoPrefix = event.body.slice(this.options.commandPrefix.length).trim();
				const [cmdName, ...args] = bodyNoPrefix.split(/\s+/);
				const handler = this.commands.get(cmdName?.toLowerCase());
				if (handler) {
					const ctx = this._createContext(event, args);
					Promise.resolve(handler(ctx)).catch(e => this.emit("error", e));
				}
			}
		} else if (event.type === "reaction" || event.type === "message_reaction") {
			this.emit("reaction", event);
			this.emit("message_reaction", event);
		} else if (event.type === "typing" || event.type === "typ") {
			this.emit("typing", event);
		}
	}

	_createContext(event, args) {
		return {
			event,
			args,
			threadID: event.threadID,
			messageID: event.messageID,
			senderID: event.senderID,
			replyAsync: (text) => this.replyToMessage(event.threadID, text, event.messageID),
			sendAsync: (text) => this.sendMessage(text, event.threadID),
			reactAsync: (emoji) => this.sendReaction(emoji, event.messageID, event.threadID)
		};
	}

	command(name, handler) {
		this.commands.set(String(name).toLowerCase(), handler);
		return this;
	}

	getCurrentUserID() {
		return this.userID || this.browserSession.userId || null;
	}

	getAppState() {
		return this.browserSession.exportAppState();
	}

	// ─── Messaging ─────────────────────────────────────────────────────────────

	async sendMessage(form, threadID, callback, replyToMessageID) {
		let cb = typeof callback === "function" ? callback : (typeof threadID === "function" ? threadID : undefined);
		let targetThread = typeof threadID === "function" ? null : threadID;
		let replyTarget = replyToMessageID;

		if (!targetThread && typeof form === "object" && form) {
			targetThread = form.threadID || form.threadId;
		}
		if (typeof callback === "string" || typeof callback === "number") {
			replyTarget = String(callback);
		}

		const text = typeof form === "object" && form !== null ? (form.body != null ? String(form.body) : "") : String(form || "");

		const promise = (async () => {
			if (!targetThread) throw new Error("threadID is required to sendMessage");
			this.lastThreadID = String(targetThread);
			return await this.graphQLClient.broadcastText(targetThread, text, replyTarget);
		})();

		if (typeof cb === "function") {
			promise.then(r => cb(null, r), e => cb(e));
			return undefined;
		}
		return promise;
	}

	async replyToMessage(threadID, message, replyToMessageID, callback) {
		return this.sendMessage(message, threadID, callback, replyToMessageID);
	}

	async unsendMessage(messageID, threadID, callback) {
		let cb = typeof threadID === "function" ? threadID : callback;
		let tid = typeof threadID === "function" ? null : threadID;
		if (!tid && messageID) {
			tid = this.recentMessageThreads.get(String(messageID)) || this.lastThreadID;
		}

		const promise = (async () => {
			if (!tid) throw new Error("threadID required to unsendMessage");
			return await this.graphQLClient.unsendMessage(tid, messageID);
		})();

		if (typeof cb === "function") {
			promise.then(r => cb(null, r), e => cb(e));
			return undefined;
		}
		return promise;
	}

	// ─── Reactions ─────────────────────────────────────────────────────────────

	async sendReaction(reaction, messageID, threadID, callback) {
		let cb = typeof threadID === "function" ? threadID : callback;
		let tid = typeof threadID === "function" ? null : threadID;
		if (!tid && messageID) {
			tid = this.recentMessageThreads.get(String(messageID)) || this.lastThreadID;
		}

		const promise = (async () => {
			if (!messageID) throw new Error("messageID is required to sendReaction");
			if (tid && this.mqttClient && this.mqttClient.connected) {
				try {
					await this.mqttClient.sendReaction(tid, messageID, reaction || "");
					return { success: true };
				} catch (_) {}
			}
			if (tid) {
				return await this.graphQLClient.broadcastReaction(tid, messageID, reaction || "");
			}
			return { success: false };
		})();

		if (typeof cb === "function") {
			promise.then(r => cb(null, r), e => cb(e));
			return undefined;
		}
		return promise;
	}

	setMessageReaction(reaction, messageID, threadID, callback) {
		return this.sendReaction(reaction, messageID, threadID, callback);
	}

	// ─── Typing Indicators ─────────────────────────────────────────────────────

	async sendTypingIndicator(threadID, callback) {
		const promise = this.graphQLClient.sendTypingIndicator(threadID);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return () => this.stopTypingIndicator(threadID);
	}

	async stopTypingIndicator(threadID, callback) {
		const promise = this.graphQLClient.stopTypingIndicator(threadID);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return promise;
	}

	// ─── Threads & Users ───────────────────────────────────────────────────────

	async markAsRead(threadID, callback) {
		const promise = this.graphQLClient.markAsRead(threadID);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return promise;
	}

	async getThreadInfo(threadID, callback) {
		const promise = this.graphQLClient.getThreadInfo(threadID);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return promise;
	}

	async getThreadList(options, callback) {
		let cb = typeof options === "function" ? options : callback;
		let opts = typeof options === "object" ? options : {};
		const promise = this.graphQLClient.getInbox(opts);
		if (typeof cb === "function") promise.then(r => cb(null, r), e => cb(e));
		return promise;
	}

	async getUserInfo(userID, callback) {
		const promise = this.graphQLClient.getUserInfo(userID);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return promise;
	}

	async getUserInfoByUsername(username, callback) {
		const promise = this.graphQLClient.getUserInfoByUsername(username);
		if (typeof callback === "function") promise.then(r => callback(null, r), e => callback(e));
		return promise;
	}

	// ─── GraphQL Direct Execution ──────────────────────────────────────────────

	async graphQL(docId, variables = {}) {
		return this.graphQLClient.graphQL(docId, variables);
	}

	async graphQLQuery(query, variables = {}) {
		return this.graphQLClient.graphQLQuery(query, variables);
	}

	// ─── Realtime Listener ─────────────────────────────────────────────────────

	listen(callback) {
		if (typeof callback === "function") {
			this.on("event", (evt) => callback(null, evt));
		}
		this.start();
		return () => this.stopListening();
	}

	listenMqtt(callback) {
		return this.listen(callback);
	}

	async start() {
		if (this.mqttClient) {
			try {
				await this.mqttClient.connect();
			} catch (err) {
				this.emit("error", err);
			}
		}
		return this;
	}

	stopListening() {
		if (this.mqttClient) {
			this.mqttClient.manualDisconnect = true;
			if (this.mqttClient.mqttClient) {
				try { this.mqttClient.mqttClient.end(true); } catch (_) {}
			}
		}
		this.isConnected = false;
	}
}

/**
 * Creates an event-driven bot using browser user-session emulation.
 */
async function createMessengerBot(credentials, options = {}) {
	const bot = new UserSessionEmulation(credentials, options);
	await bot.start();
	return bot;
}

/**
 * Standard login function returning flat API.
 */
function login(credentials, options, callback) {
	let opts = options;
	let cb = callback;
	if (typeof options === "function") {
		cb = options;
		opts = {};
	}

	const session = new UserSessionEmulation(credentials, opts);
	if (typeof cb === "function") {
		session.on("ready", () => cb(null, session));
		session.on("error", (err) => cb(err));
	}
	session.start().catch(err => {
		if (typeof cb === "function") cb(err);
	});
	return Promise.resolve(session);
}

module.exports = {
	UserSessionEmulation,
	createMessengerBot,
	createInstagramBot: createMessengerBot,
	login
};
