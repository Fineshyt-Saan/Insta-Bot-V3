"use strict";

/**
 * InstaBOT runtime: login, listener and lifecycle.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("./logger");
const { loadAccount } = require("./config");
const { createDatabase } = require("./database");
const { createRegistry, loadAll } = require("./commandLoader");
const { createDispatcher } = require("./dispatcher");
const { createOnlineStatus } = require("./onlineStatus");

const serverLogin = require("../auth");

/**
 * Cookies the bot itself will hand to the server. `IG_COOKIES` (an env var on
 * the bot service) wins, else `account.txt`. Returns a cookie blob (string,
 * JSON array or Netscape text) the server understands, or null when the bot has
 * none — in which case the server must have its own.
 */
function loadServerCookies() {
	if (process.env.IG_COOKIES && process.env.IG_COOKIES.trim()) return process.env.IG_COOKIES.trim();
	try {
		return loadAccount();
	}
	catch (_) {
		return null;
	}
}

/**
 * Resolve the login function. When `server.url` + `server.token` are set the
 * bot talks to the private ig-chat-api server through auth.js; otherwise it
 * falls back to a locally-installed ig-chat-api package (Mode B, development).
 */
function resolveLogin(config) {
	const server = config.server || {};
	if (server.url && server.token) return { login: serverLogin, mode: "server" };
	try {
		return { login: require("ig-chat-api"), mode: "direct" };
	}
	catch (_) {}
	try {
		const fs = require("fs");
		const path = require("path");
		const localIca = path.resolve(__dirname, "../ica");
		if (fs.existsSync(localIca)) {
			return { login: require(localIca), mode: "direct" };
		}
	}
	catch (err) {
		log.error("ICA", "Could not load local ICA engine", err);
	}
	throw new Error(
		"No server configured and the direct 'ig-chat-api' package or local 'ica' is not available.\n" +
		"Recommended: set server.url + server.token in config.json (or IG_API_SERVER / IG_API_TOKEN).\n" +
		"Mode B (development): place cookies in account.txt."
	);
}

/**
 * Normalize an ig-chat-api event into the shape the rest of InstaBOT uses:
 *  - add `messageReply` (mirroring `repliedToMessage`) and switch the type to
 *    "message_reply" so commands can branch on replies,
 *  - map media attachment types ("image" -> "photo"),
 *  - add a `userID` alias for `senderID`.
 * ig-chat-api itself is left untouched.
 */
function normalizeEvent(event) {
	if (!event || typeof event !== "object") return event;
	const normalized = Object.assign({}, event);

	let attachments = Array.isArray(normalized.attachments) ? normalized.attachments.map(att => {
		if (!att || typeof att !== "object") return att;
		const type = att.type === "image" ? "photo" : att.type === "gif" ? "animated_image" : att.type;
		return Object.assign({}, att, { type });
	}) : [];

	if (attachments.length === 0) {
		const m = normalized.media || normalized.visual_media?.media || normalized.raven_media?.media || normalized.clip?.clip || normalized.media_share || normalized.direct_story?.media || (normalized.raw && (normalized.raw.media || normalized.raw.visual_media?.media));
		const u = m?.image_versions2?.candidates?.[0]?.url
			|| m?.candidates?.[0]?.url
			|| normalized.image_versions2?.candidates?.[0]?.url
			|| (normalized.raw?.image_versions2?.candidates?.[0]?.url)
			|| normalized.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
			|| normalized.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
			|| m?.video_versions?.[0]?.url
			|| normalized.video_versions?.[0]?.url
			|| m?.url
			|| (typeof normalized.photo === "string" ? normalized.photo : normalized.photo?.url)
			|| (typeof normalized.image === "string" ? normalized.image : normalized.image?.url);
		if (u) {
			const isVid = (m?.media_type === 2 || m?.video_versions || normalized.video_versions);
			attachments.push({
				type: isVid ? "video" : "photo",
				url: u
			});
		}
	}
	normalized.attachments = attachments;

	const repliedData = normalized.messageReply || normalized.repliedMessage || normalized.repliedToMessage || normalized.replyToMessage || normalized.reply_to_message || normalized.replied_to_message || normalized.replied_to_item || normalized.reply_to_item || normalized.quoted_item || (normalized.raw && (normalized.raw.messageReply || normalized.raw.repliedMessage || normalized.raw.replyToMessage || normalized.raw.replied_to_message || normalized.raw.replied_to_item));
	if (repliedData) {
		const replied = repliedData;
		let attachList = [];
		if (Array.isArray(replied.attachments) && replied.attachments.length > 0) {
			attachList = replied.attachments.map(att => {
				if (!att || typeof att !== "object") return att;
				const type = att.type === "image" ? "photo" : att.type === "gif" ? "animated_image" : att.type;
				return Object.assign({}, att, { type });
			});
		} else if (replied.attachment) {
			const rawList = Array.isArray(replied.attachment) ? replied.attachment : [replied.attachment];
			attachList = rawList.map(att => {
				if (!att || typeof att !== "object") return att;
				const type = att.type === "image" ? "photo" : att.type === "gif" ? "animated_image" : att.type;
				return Object.assign({}, att, { type });
			});
		} else {
			const rm = replied.media || replied.visual_media?.media || replied.raven_media?.media || replied.clip?.clip || replied.media_share || replied.direct_story?.media;
			const ru = rm?.image_versions2?.candidates?.[0]?.url
				|| rm?.candidates?.[0]?.url
				|| replied.image_versions2?.candidates?.[0]?.url
				|| replied.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
				|| replied.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
				|| replied.reel_share?.media?.image_versions2?.candidates?.[0]?.url
				|| replied.story_share?.media?.image_versions2?.candidates?.[0]?.url
				|| rm?.video_versions?.[0]?.url
				|| replied.video_versions?.[0]?.url
				|| rm?.url
				|| (typeof replied.photo === "string" ? replied.photo : replied.photo?.url)
				|| (typeof replied.image === "string" ? replied.image : replied.image?.url);
			if (ru) {
				const isVid = (rm?.media_type === 2 || rm?.video_versions || replied.video_versions);
				attachList.push({ type: isVid ? "video" : "photo", url: ru });
			}
		}

		normalized.messageReply = {
			...replied,
			messageID: (replied.messageID || replied.item_id || replied.id || normalized.replyTo || normalized.reply_to_item_id || normalized.replied_to_item_id || normalized.replied_to_target_id)?.toString() || null,
			senderID: (replied.senderID || replied.user_id || replied.sender_id) != null ? String(replied.senderID || replied.user_id || replied.sender_id) : null,
			body: (replied.body || replied.text || replied.caption?.text || (typeof replied.caption === "string" ? replied.caption : "")) != null ? String(replied.body || replied.text || replied.caption?.text || (typeof replied.caption === "string" ? replied.caption : "")) : "",
			attachments: attachList,
			timestamp: (replied.timestamp || "").toString() || null
		};
		normalized.repliedMessage = normalized.messageReply;
		normalized.replyTo = normalized.messageReply.messageID;
		if (normalized.type === "message") normalized.type = "message_reply";
	}

	if (!normalized.body && (normalized.caption || normalized.media?.caption || normalized.visual_media?.media?.caption)) {
		const cap = normalized.caption?.text || (typeof normalized.caption === "string" ? normalized.caption : "") || normalized.media?.caption?.text || normalized.visual_media?.media?.caption?.text || "";
		if (cap) normalized.body = cap;
	}

	if (normalized.senderID != null && normalized.userID == null) normalized.userID = normalized.senderID;
	if (normalized.userID != null && normalized.senderID == null) normalized.senderID = normalized.userID;

	// Membership changes (join/leave) may arrive under different names depending
	// on the transport; normalize the participant lists every event script reads.
	const added = firstArray(normalized.userIDs, normalized.addedParticipants, normalized.added_participants,
		normalized.added_users, normalized.added_user_ids, normalized.usersAdded, normalized.users_added,
		normalized.participantsAdded, normalized.participants_added);
	const removed = firstArray(normalized.removedParticipants, normalized.removed_participants,
		normalized.removed_users, normalized.removed_user_ids, normalized.left_users, normalized.usersRemoved,
		normalized.users_removed, normalized.participantsRemoved, normalized.participants_removed);

	if (normalized.type === "join" && !normalized.userIDs) normalized.userIDs = added || [];
	if (normalized.type === "leave" && !normalized.userIDs) normalized.userIDs = removed || [];

	// Infer a group thread when the API omitted isGroup: the realtime payload
	// often does. A participant list with more than one member, or a legacy
	// "thread:user" id, both mean a group.
	if (normalized.isGroup !== true) {
		const members = [...(added || []), ...(removed || []), ...(normalized.userIDs || []),
			...(normalized.participantIDs || []), ...(normalized.participants || [])];
		const unique = new Set(members.map(String).filter(Boolean));
		const legacyGroup = String(normalized.threadID || "").includes(":");
		const isMembership = normalized.type === "join" || normalized.type === "leave";
		const looksGroup = Array.isArray(added) || Array.isArray(removed) ||
			isMembership || legacyGroup || unique.size > 2;
		if (looksGroup) {
			normalized.isGroup = true;
		} else if (unique.size === 2 || String(normalized.threadID) === String(normalized.senderID) || normalized.threadType === 1 || normalized.threadType === "1" || normalized.isGroup === false) {
			normalized.isGroup = false;
		}
	}

	return normalized;
}

// Return the first argument that is a non-empty array, else null.
function firstArray(...candidates) {
	for (const value of candidates) {
		if (Array.isArray(value)) return value;
	}
	return null;
}

function createBot(config) {
	const startedAt = Date.now();
	global.instabotStartedAt = startedAt;
	const database = createDatabase(config);
	const registry = createRegistry();

	try {
		global.utils = require("../utils");
	} catch (_) {
		global.utils = require("./utils");
	}
	global.GoatBot = {
		commands: registry.commands,
		aliases: registry.aliases,
		onReply: new Map(),
		onReaction: new Map(),
		config
	};
	const state = {
		api: null,
		botID: null,
		listening: null,
		stopListening: null,
		listenerGeneration: 0,
		restartTimer: null,
		retireListener: null,
		running: false,
		stopping: false,
		commandCount: 0,
		eventCount: 0,
		messagesHandled: 0
	};

	const onlineStatus = createOnlineStatus({
		config,
		startedAt,
		stats: () => ({
			botID: state.botID,
			commands: state.commandCount,
			events: state.eventCount,
			messagesHandled: state.messagesHandled
		})
	});

	let dispatcher = null;

	function loadCommands() {
		const { commandCount, eventCount } = loadAll(registry);
		state.commandCount = commandCount;
		state.eventCount = eventCount;
	}

	function startServer() {
		let login, mode;
		try {
			({ login, mode } = resolveLogin(config));
		}
		catch (error) {
			return Promise.reject(error);
		}

		return new Promise((resolve, reject) => {
			const finish = async (error, api) => {
				if (error) return reject(error);
				const { createAPIWrapper } = require("../platforms/instagram/adapter/apiWrapper");
				const wrappedApi = createAPIWrapper(api, config);
				state.api = wrappedApi;
				state.botID = String(wrappedApi.getCurrentUserID());
				dispatcher = createDispatcher({ api: wrappedApi, config, registry, database });

				try {
					const fetchInfo = api.getUserInfo(state.botID);
					const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("getUserInfo timeout")), 3500));
					const info = await Promise.race([fetchInfo, timeout]);
					const profile = info && info[state.botID];
					log.success("LOGIN", `Logged in as ${state.botID}${profile && profile.vanity ? ` (@${profile.vanity})` : ""}`);
				}
				catch (_) {
					log.success("LOGIN", `Logged in as ${state.botID}`);
				}

				startListening();
				onlineStatus.start();
				resolve(api);
			};

			if (mode === "server") {
				const options = {
					server: config.server.url,
					token: config.server.token,
					botId: config.server.botId,
					timeout: Number(config.server.timeout) || 60000,
					selfListen: config.selfListen === true,
					// Hand the server our cookies (account.txt / IG_COOKIES) so the
					// bot can own them instead of the server. Re-read on every
					// attempt so a repaste is picked up on reconnect.
					cookies: loadServerCookies()
				};
				log.info("LOGIN", `Connecting to ig-chat-api server at ${options.server} as "${options.botId || "default"}"${options.selfListen ? " (selfListen on)" : ""}`);
				Promise.resolve(login(options)).then(api => finish(null, api), finish);
				return;
			}

			login({ appState: loadAccount() }, buildOptions(), finish);
		});
	}

	function buildOptions() {
		const options = {
			listenEvents: config.listenEvents,
			selfListen: config.selfListen,
			autoMarkRead: config.autoMarkRead,
			autoMarkDelivery: config.autoMarkDelivery,
			autoReconnect: config.autoReconnect,
			logLevel: "silent"
		};
		if (config.account && config.account.proxy) options.proxy = config.account.proxy;
		if (config.account && config.account.userAgent) options.userAgent = config.account.userAgent;
		return options;
	}

	function handleListenerEvent(error, rawEvent) {
		if (error) return handleListenerError(error);
		// Internal notices from the server bridge (never user events).
		if (rawEvent && rawEvent.__internal) {
			if (rawEvent.__internal === "relogin") {
				log.warn("LISTEN", "Server is re-logging in; waiting for the stream to resume");
				onlineStatus.writeLine({ event: "relogin", reason: rawEvent.reason || null });
			}
			else if (rawEvent.__internal === "error") {
				handleListenerError(rawEvent.error || { message: "server error" });
			}
			return;
		}
		const event = normalizeEvent(rawEvent);
		if (!event || event.type === "ready") return;

		state.messagesHandled++;

		if (shouldLog(event.type)) {
			const shown = Object.assign({}, event);
			if (Array.isArray(shown.participantIDs)) shown.participantIDs = `Array(${shown.participantIDs.length})`;
			log.info(String(event.type).toUpperCase(), JSON.stringify(shown));
		}

		Promise.resolve(dispatcher.handle(event)).catch(err => log.error("DISPATCH", "Unhandled error", err));
	}

	function shouldLog(type) {
		const settings = config.logEvents || {};
		if (settings.disableAll === true) return false;
		return settings[type] === true;
	}

	function handleListenerError(error) {
		const message = String(error && (error.error || error.message) || error);
		if (/connection closed|closed by user|aborted|socket hang up|ECONNRESET|ETIMEDOUT/i.test(message)) return;
		onlineStatus.writeLine({ event: "listener_error", error: message });
		if (/not logged in|login_required|logged.?out/i.test(message)) {
			log.error("LISTEN", "Session is no longer valid. Re-reading account.txt…", message);
			scheduleRelogin();
		}
		else {
			log.error("LISTEN", "Listener error", message);
		}
	}

	function startListening() {
		state.listenerGeneration++;
		const generation = state.listenerGeneration;
		// Retire the previous listener (and any scheduled restart) so we never
		// stack MQTT clients; overlapping listeners leak sockets over time.
		if (state.retireListener) clearTimeout(state.retireListener);
		try {
			if (typeof state.stopListening === "function") state.stopListening();
		}
		catch (_) { /* ignore */ }
		state.stopListening = state.api.listenMqtt((error, event) => {
			if (generation !== state.listenerGeneration) return;
			handleListenerEvent(error, event);
		});
		state.listening = true;
		log.success("LISTEN", "Realtime listener started");

		if (state.restartTimer) clearInterval(state.restartTimer);
		const interval = Number(config.restartListenInterval) || 0;
		if (interval > 0) {
			state.restartTimer = setInterval(() => restartListening(), interval);
			if (state.restartTimer.unref) state.restartTimer.unref();
		}
	}

	function restartListening() {
		try {
			if (typeof state.stopListening === "function") state.stopListening();
		}
		catch (_) { /* ignore */ }
		if (state.retireListener) clearTimeout(state.retireListener);
		state.retireListener = setTimeout(() => { state.retireListener = null; startListening(); }, 1000);
		if (state.retireListener.unref) state.retireListener.unref();
		log.info("LISTEN", "Listener restarted");
	}

	function scheduleRelogin() {
		if (state.retireListener) return;
		state.retireListener = setTimeout(() => {
			state.retireListener = null;
			log.info("LOGIN", "Reconnecting the realtime listener");
			startListening();
		}, 5000);
		if (state.retireListener.unref) state.retireListener.unref();
	}

	async function start() {
		log.master("BOOT", `${config.botName} starting…`);
		// Load commands/events once, before connecting. Re-running this on every
		// retry would duplicate entries and drop the count to zero.
		loadCommands();
		log.info("LOADER", `Registered ${state.commandCount} commands and ${state.eventCount} events successfully.`);

		// Retry the initial connection instead of exiting: the server may not have
		// cookies yet (or may be cold-starting on a free tier). A fatal exit here
		// would fail the deploy and also stop the bot from recovering on its own.
		let attempt = 0;
		for (;;) {
			if (state.stopping) return;
			try {
				await startServer();
				break;
			}
			catch (error) {
				attempt++;
				const message = String(error && (error.error || error.message) || error);
				const delay = Math.min(60000, 5000 * attempt);
				onlineStatus.writeLine({ event: "boot_retry", attempt, error: message });
				log.warn("BOOT", `Connection attempt ${attempt} failed: ${message}`);
				log.info("BOOT", `Retrying in ${Math.round(delay / 1000)}s…`);
				// Keep the process alive so the host does not mark the deploy failed
				// and so a later cookie/server fix is picked up without a redeploy.
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
		if (state.stopping) return;
		state.running = true;
		log.box("INSTABOT ONLINE", [
			`${config.botName} is online and operational!`,
			`Logged in as:  ${state.botID || "Instagram User"}`,
			`Commands:      ${state.commandCount} active`,
			`Events:        ${state.eventCount} active`,
			`Prefix:        ${config.prefix || "*"}`,
			`Try typing:    ${config.prefix || "*"}help in any chat`
		], "green");
	}

	async function stop() {
		state.running = false;
		state.stopping = true;
		onlineStatus.writeLine({ event: "stopping" });
		try {
			if (typeof state.stopListening === "function") state.stopListening();
		}
		catch (_) { /* ignore */ }
		// Cancel BOTH timers: the periodic restart interval AND a one-shot
		// listener retire/relogin timeout. Without clearing the latter, a callback
		// could recreate the listener after stop().
		if (state.restartTimer) { clearInterval(state.restartTimer); state.restartTimer = null; }
		if (state.retireListener) { clearTimeout(state.retireListener); state.retireListener = null; }
		database.flush();
		// Deliberately DO NOT call api.logout() on shutdown.
		//
		// In server mode this RPCs Instagram's /accounts/logout/, which invalidates
		// the sessionid server-side and permanently kills the cookies. A platform
		// sends SIGTERM on every redeploy, so logging out on exit means every
		// deploy logs the account out. Dropping the in-memory handle is enough;
		// the cookie stays valid for the next boot.
		log.master("BOOT", `${config.botName} stopped`);
	}

	return { start, stop, state, database, registry, normalizeEvent };
}

module.exports = { createBot, normalizeEvent };
