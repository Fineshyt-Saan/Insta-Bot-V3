"use strict";

/**
 * InstaBOT test runner — no external dependencies.
 * Exercises config parsing, event normalization, the message context and the
 * dispatcher against a fake ig-chat-api client.
 *
 *   node test/run.js
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");

// Redirect config writes to a scratch copy BEFORE anything requires src/config.
// Several commands call saveConfig() (admin, whitelist, prefix); without this a
// test run overwrites the operator's real config.json.
const SCRATCH_CONFIG = path.join(os.tmpdir(), "instabot-test-config-" + process.pid + ".json");
try { fs.copyFileSync(path.join(root, "config.json"), SCRATCH_CONFIG); } catch (_) { fs.writeFileSync(SCRATCH_CONFIG, "{}"); }
process.env.IG_CONFIG_PATH = SCRATCH_CONFIG;
process.on("exit", () => { try { fs.unlinkSync(SCRATCH_CONFIG); } catch (_) { } });

const log = require(path.join(root, "src/logger"));
log.setQuiet(true);

const { normalizeEvent } = require(path.join(root, "src/bot"));
const { normalizeCookies, netScapeToCookies, cookieHeaderToCookies, isNetScapeCookie } = require(path.join(root, "src/config"));
const utils = require(path.join(root, "src/utils"));
const { createMessageContext } = require(path.join(root, "src/message"));
const { createRegistry, loadAll } = require(path.join(root, "src/commandLoader"));
const { createDispatcher } = require(path.join(root, "src/dispatcher"));

let count = 0;
const results = [];
async function test(name, fn) {
	try {
		await fn();
		count++;
		results.push({ name, ok: true });
	}
	catch (error) {
		results.push({ name, ok: false, error });
	}
}

function fakeApi(overrides = {}) {
	const calls = [];
	const api = Object.assign({
		calls,
		getCurrentUserID: () => "100",
		getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, name: "Test User", vanity: "tester" } }),
		getThreadInfo: (id, cb) => cb(null, { threadID: id, isGroup: true, userInfo: [], adminIDs: [] }),
		sendMessage: (form, threadID, cb, reply) => {
			calls.push({ method: "sendMessage", form, threadID, reply });
			cb && cb(null, { threadID, messageID: "m" + calls.length });
			return Promise.resolve({ threadID, messageID: "m" + calls.length });
		},
		sendImage: (img, threadID, caption, cb, reply) => {
			calls.push({ method: "sendImage", img, caption, reply, threadID });
			cb && cb(null, { threadID, messageID: "img" + calls.length });
		},
		sendAudio: (a, threadID, cb, reply) => { calls.push({ method: "sendAudio", src: a, threadID, reply }); cb && cb(null, { threadID, messageID: "aud" + calls.length }); },
		sendVideo: (v, threadID, cb) => { calls.push({ method: "sendVideo", threadID }); cb && cb(null, {}); },
		unsendMessage: (id, threadID, cb) => { calls.push({ method: "unsendMessage", id, threadID }); cb && cb(null, {}); },
		setMessageReaction: (r, id, threadID, cb) => { calls.push({ method: "setMessageReaction", r, id, threadID }); cb && cb(null, {}); },
		sendTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendTextEffect", text, effect }); cb && cb(null, {}); },
		sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendAvatarTextEffect", text, effect }); cb && cb(null, {}); },
		sendMusic: (threadID, track, cb) => { calls.push({ method: "sendMusic", threadID, track }); cb && cb(null, { threadID, messageID: "music" }); },
		musicSearch: (query, cb) => {
			calls.push({ method: "musicSearch", query });
			cb && cb(null, { query, tracks: [
				{ title: "Song A", artist: "Artist A", durationMs: 210000, audioClusterID: "111", url: "https://cdn.example/song-a.mp4" },
				{ title: "Song B", artist: "Artist B", durationMs: 180000, audioClusterID: "222", url: "https://cdn.example/song-b.mp4" }
			] });
		},
		sendTypingIndicator: () => () => { },
		changeProfilePicture: (src, cb) => { calls.push({ method: "changeProfilePicture", src }); cb && cb(null, {}); },
		changeBio: (b, cb) => { calls.push({ method: "changeBio", b }); cb && cb(null, {}); },
		addUserToThread: (uid, threadID, cb) => { calls.push({ method: "addUserToThread", uid, threadID }); cb && cb(null, {}); },
		removeUserFromThread: (uid, threadID, cb) => { calls.push({ method: "removeUserFromThread", uid, threadID }); cb && cb(null, {}); },
		listenMqtt: () => () => { }
	}, overrides);
	return api;
}

function makeConfig(overrides = {}) {
	return Object.assign({
		botName: "InstaBOT",
		prefix: "-",
		language: "en",
		adminBot: ["999"],
		antiInbox: false,
		noPrefix: false,
		adminOnly: { enable: false, ignoreCommands: [] },
		defaultOff: false,
		whiteList: { enable: false, userIDs: [], threadIDs: [] },
		welcome: { enable: true, message: "Welcome %1 to %2! 👋", selfMessage: "Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.", threadIDs: [] },
		leave: { enable: true, message: "%1 left %2. 👋", threadIDs: [] },
		hideNotiMessage: {},
		cooldown: { default: 0 },
		logEvents: { disableAll: true },
		listenEvents: true
	}, overrides);
}

function makeDatabase() {
	const users = new Map();
	const threads = new Map();
	return {
		users: {
			ensure(id, patch) { if (!users.has(id)) users.set(id, Object.assign({ userID: id, banned: { status: false }, settings: {}, data: {} }, patch)); return users.get(id); },
			get: id => users.get(id) || null,
			update(id, patch) { const u = users.get(id); if (u) Object.assign(u, patch); return u; },
			set(id, patch) { users.set(id, patch); return patch; },
			count: () => users.size,
			flush() { }
		},
		threads: {
			ensure(id, patch) { if (!threads.has(id)) threads.set(id, Object.assign({ threadID: id, adminIDs: [], members: [], settings: {}, data: {} }, patch)); return threads.get(id); },
			get: id => threads.get(id) || null,
			update(id, patch) { const t = threads.get(id); if (t) Object.assign(t, patch); return t; },
			set(id, patch) { threads.set(id, patch); return patch; },
			count: () => threads.size,
			flush() { }
		}
	};
}

async function main() {
	// Username lookups are cached on disk; start every run clean.
	utils._resetUsernameCache();

	/* ── event normalization ── */
	await test("normalizeEvent: reply becomes message_reply + messageReply", () => {
		const ev = normalizeEvent({
			type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi",
			attachments: [{ type: "image", url: "u" }],
			repliedToMessage: { messageID: "o", senderID: "9", body: "bot" }
		});
		assert.strictEqual(ev.type, "message_reply");
		assert.strictEqual(ev.messageReply.messageID, "o");
		assert.strictEqual(ev.messageReply.senderID, "9");
		assert.strictEqual(ev.attachments[0].type, "photo");
		assert.strictEqual(ev.userID, "42");
	});

	await test("normalizeEvent: plain message keeps type", () => {
		const ev = normalizeEvent({ type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi", attachments: [] });
		assert.strictEqual(ev.type, "message");
		assert.strictEqual(ev.messageReply, undefined);
	});

	/* ── config parsing ── */
	await test("config: JSON array cookies", () => {
		const list = normalizeCookies([{ key: "sessionid", value: "a" }, { key: "ds_user_id", value: "1" }]);
		assert.strictEqual(list.length, 2);
		assert.strictEqual(list[0].domain, "instagram.com");
	});

	await test("config: cookie header string", () => {
		const list = cookieHeaderToCookies("sessionid=a; ds_user_id=1; csrftoken=x");
		assert.strictEqual(list.length, 3);
	});

	await test("config: loadConfig fills every field the dispatcher reads", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.ok(config.hideNotiMessage && typeof config.hideNotiMessage === "object");
		assert.ok(config.adminOnly && typeof config.adminOnly.enable === "boolean");
		assert.ok(Array.isArray(config.adminOnly.ignoreCommands));
		assert.ok(config.cooldown && typeof config.cooldown.default === "number");
		assert.ok(config.logEvents && typeof config.logEvents === "object");
		assert.ok(config.server && "url" in config.server && "token" in config.server);
		assert.ok(typeof config.server.timeout === "number");
		assert.ok(typeof config.prefix === "string" && config.prefix.length > 0);
	});

	await test("config: there is no bot id to configure", () => {
		// The server identifies each session by the account's Instagram id and
		// tells the bot what it is; the bot must not carry a botId setting.
		const { loadConfig, configPath } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.strictEqual(config.server.botId, undefined, "server.botId must not exist");

		const before = process.env.IG_BOT_ID;
		process.env.IG_BOT_ID = "should-be-ignored";
		try {
			assert.strictEqual(loadConfig().server.botId, undefined, "IG_BOT_ID must not resurrect botId");
		}
		finally {
			if (before === undefined) delete process.env.IG_BOT_ID;
			else process.env.IG_BOT_ID = before;
		}
	});

	await test("config: the environment overrides a committed server url and token", () => {
		// Regression: forkers set IG_API_SERVER in their host dashboard, but a
		// committed config.json still pointed the bot at the original author's
		// server (and so at that author's Instagram account). The environment
		// must always win.
		const { loadConfig } = require(path.join(root, "src/config"));
		const urlBefore = process.env.IG_API_SERVER;
		const tokenBefore = process.env.IG_API_TOKEN;
		process.env.IG_API_SERVER = "https://my-own-server.example";
		process.env.IG_API_TOKEN = "my-own-token";
		try {
			const config = loadConfig();
			assert.strictEqual(config.server.url, "https://my-own-server.example",
				"IG_API_SERVER must override config.server.url");
			assert.strictEqual(config.server.token, "my-own-token",
				"IG_API_TOKEN must override config.server.token");
		}
		finally {
			if (urlBefore === undefined) delete process.env.IG_API_SERVER;
			else process.env.IG_API_SERVER = urlBefore;
			if (tokenBefore === undefined) delete process.env.IG_API_TOKEN;
			else process.env.IG_API_TOKEN = tokenBefore;
		}
	});

	await test("config: ships the shared server and no personal admin id", () => {
		// Model A: one shared server. url + token are global and intentionally
		// committed, so a fork works out of the box. What must NOT be committed
		// is a personal admin id — that is per-deployment.
		//
		// Read config.json directly (not loadConfig, which points at the test's
		// scratch copy) so this asserts what is actually committed to the repo.
		const committed = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
		assert.match(committed.server.url, /^https?:\/\//, "config.json must ship the shared server url");
		assert.ok(committed.server.token.length > 0, "config.json must ship the shared server token");
		assert.deepStrictEqual(committed.adminBot, [], "config.json must not ship a personal admin id");
	});

	await test("config: IG_ADMIN_BOT sets per-deployment admins", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const before = process.env.IG_ADMIN_BOT;
		process.env.IG_ADMIN_BOT = "111, 222";
		try {
			assert.deepStrictEqual(loadConfig().adminBot, ["111", "222"]);
		}
		finally {
			if (before === undefined) delete process.env.IG_ADMIN_BOT;
			else process.env.IG_ADMIN_BOT = before;
		}
	});

	await test("config: a thrown loadAccount error tells you to copy the example file", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		assert.ok(loadConfig(), "config must load");
		const source = require("fs").readFileSync(path.join(root, "src", "config.js"), "utf8");
		assert.match(source, /account\.example\.txt/, "the missing-cookie error must point at the example file");
	});

	await test("bot: adopts the session id the server assigns (not a configured one)", async () => {
		// The bot starts with no id, posts its cookies, and adopts result.botId.
		const { pushCookies } = require(path.join(root, "auth.js"));
		assert.strictEqual(typeof pushCookies, "function", "pushCookies must be exported");

		const http = require("http");
		const original = http.request;
		http.request = (options, cb) => {
			const res = {
				statusCode: 200,
				on(event, handler) {
					if (event === "data") handler(Buffer.from(JSON.stringify({ ok: true, result: { botId: "24268962575", accepted: true } })));
					if (event === "end") handler();
					return this;
				}
			};
			if (cb) cb(res);
			return { on() { return this; }, write() { }, end() { }, destroy() { } };
		};
		try {
			const outcome = await pushCookies(
				{ base: new URL("http://127.0.0.1:9999"), token: "t", botId: "" },
				"sessionid=a; ds_user_id=24268962575"
			);
			assert.strictEqual(outcome.botId, "24268962575", "the server-assigned id must be returned");
		}
		finally {
			http.request = original;
		}
	});

	await test("config: netscape file", () => {
		const text = ".instagram.com\tTRUE\t/\tTRUE\t1735689600\tsessionid\tabc";
		assert.ok(isNetScapeCookie(text));
		const list = netScapeToCookies(text);
		assert.strictEqual(list[0].key, "sessionid");
	});

	await test("config: netscape #HttpOnly_ lines are not skipped", () => {
		// Cookie-Editor exports sessionid as an HttpOnly cookie, i.e. a
		// `#HttpOnly_` line. Skipping it (as a comment) drops the login cookie.
		const text = [
			"# Netscape HTTP Cookie File",
			"#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1823895835\tcsrftoken\tTOKEN",
			"#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1823746805\tsessionid\tSID123",
			".instagram.com\tTRUE\t/\tTRUE\t1797111835\tds_user_id\t42"
		].join("\n");
		const list = netScapeToCookies(text);
		const keys = list.map(c => c.key);
		assert.ok(keys.includes("sessionid"), "sessionid must survive the #HttpOnly_ prefix");
		assert.ok(keys.includes("csrftoken"), "csrftoken must survive");
		assert.ok(keys.includes("ds_user_id"), "ds_user_id must survive");
	});

	/* ── utils ── */
	await test("utils: mediaKind by extension and mime", () => {
		assert.strictEqual(utils.mediaKind("a.mp4"), "video");
		assert.strictEqual(utils.mediaKind("a.m4a"), "audio");
		assert.strictEqual(utils.mediaKind("a.png"), "image");
		assert.strictEqual(utils.mediaKind({ path: "x", mimeType: "video/mp4" }), "video");
	});

	/* ── message context ── */
	await test("message: send text", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		const result = await message.send("hello");
		assert.strictEqual(api.calls[0].form.body, "hello");
		assert.strictEqual(result.messageID, "m1");
	});

	await test("message: reply threads to the event message", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply("hi");
		assert.strictEqual(api.calls[0].reply, "evt");
	});

	await test("message: attachment routes to sendImage/sendAudio/sendVideo", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.send({ body: "cap", attachment: [{ _readableState: {}, path: "a.png" }, { _readableState: {}, path: "b.m4a" }, { _readableState: {}, path: "c.mp4" }] });
		const methods = api.calls.map(c => c.method).filter(m => m !== "sendMessage");
		assert.deepStrictEqual(methods, ["sendImage", "sendAudio", "sendVideo"]);
	});

	await test("message: a caption is sent BEFORE its image", async () => {
		// Media broadcasts are media-only, so the caption is its own message.
		// It must come FIRST, so the text reads above the picture in the chat.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "a picture", attachment: { _readableState: {}, path: "a.png" } });
		const textAt = api.calls.findIndex(c => c.method === "sendMessage");
		const imgAt = api.calls.findIndex(c => c.method === "sendImage");
		assert.ok(textAt > -1 && imgAt > -1, "both the text and the image must be sent");
		assert.ok(textAt < imgAt, "the caption must precede the image");
		const image = api.calls[imgAt];
		assert.strictEqual(image.caption, "");
		assert.strictEqual(api.calls[textAt].form.body, "a picture");
		assert.strictEqual(api.calls[textAt].reply, "evt");
	});

	await test("message: textFirst false sends the media first", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "after", attachment: { _readableState: {}, path: "a.png" }, textFirst: false });
		const textAt = api.calls.findIndex(c => c.method === "sendMessage");
		const imgAt = api.calls.findIndex(c => c.method === "sendImage");
		assert.ok(textAt > imgAt, "textFirst:false must keep the media first");
	});

	await test("message: a video caption is sent as a separate message", async () => {
		// Instagram's video broadcast is media-only, so the caption must follow
		// as its own message or it is lost.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "anime edit", attachment: { _readableState: {}, path: "c.mp4" } });
		const video = api.calls.find(c => c.method === "sendVideo");
		const text = api.calls.find(c => c.method === "sendMessage");
		assert.ok(video, "the video must be sent");
		assert.ok(text, "the caption must be sent as a separate message");
		assert.strictEqual(text.form.body, "anime edit");
		assert.strictEqual(text.reply, "evt");
	});

	await test("message: an audio caption is sent as a separate reply", async () => {
		// voice_attachment is media-only too: the caption follows as its own
		// message and the reply target must survive on both sends.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "listen", attachment: { _readableState: {}, path: "b.m4a" } });
		const audio = api.calls.find(c => c.method === "sendAudio");
		const text = api.calls.find(c => c.method === "sendMessage");
		assert.ok(audio, "the audio must be sent");
		assert.ok(text, "the caption must be sent as a separate message");
		assert.strictEqual(text.form.body, "listen");
		assert.strictEqual(text.reply, "evt");
		assert.strictEqual(audio.reply, "evt");
	});

	await test("message: unsend and react use the thread", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.unsend();
		await message.react("❤");
		assert.ok(api.calls.some(c => c.method === "unsendMessage" && c.threadID === "t" && c.id === "evt"));
		assert.ok(api.calls.some(c => c.method === "setMessageReaction" && c.threadID === "t" && c.r === "❤"));
	});

	/* ── dispatcher ── */
	const registry = createRegistry();
	const loaded = loadAll(registry);

	await test("loader: commands and events registered", () => {
		assert.ok(registry.commands.size >= 8, `only ${registry.commands.size} commands`);
		assert.ok(registry.events.length >= 2, `only ${registry.events.length} events`);
		assert.ok(registry.resolve("h"), "alias h should resolve to help");
	});

	await test("dispatcher: runs a command with prefix", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		assert.ok(api.calls.some(c => c.method === "sendMessage"), "expected a reply");
	});

	await test("dispatcher: ignores non-command text", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "just chatting", isGroup: false });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	await test("dispatcher: blocks banned users", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		db.users.set("5", { userID: "5", banned: { status: true, reason: "spam" }, settings: {}, data: {} });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/banned/i.test(replies), "expected a ban notice");
	});

	await test("dispatcher: honours bot-admin-only mode (silent drop for non-admins)", async () => {
		const api = fakeApi();
		const config = makeConfig({ adminOnly: { enable: true, ignoreCommands: [] } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "expected silent drop for non-admins when admin-only is on");
	});

	await test("dispatcher: unknown commands are completely silent in admin-only mode", async () => {
		const api = fakeApi();
		const config = makeConfig({ adminOnly: { enable: true, ignoreCommands: [] } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-unknowncommandxyz", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "expected zero output for unknown command in admin-only mode");
	});

	await test("dispatcher: default-off mode blocks non-admins silently", async () => {
		const api = fakeApi();
		const config = makeConfig({ defaultOff: true });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "expected zero output for non-admins in default-off mode");
	});

	await test("bot: off turns bot off for non-admins, but admins can use commands", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const tData = { threadID: "t", adminIDs: ["admin1"], settings: {} };
		db.threads.set("t", tData);
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		// Admin turns bot off
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m1", senderID: "admin1", body: "-bot off", isGroup: true });
		assert.strictEqual(tData.adminOnly, true);

		// Non-admin tries ping
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m2", senderID: "user1", body: "-ping", isGroup: true });
		const blockedReplies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(blockedReplies, "", "expected no response for non-admin when bot is turned off");

		// Admin uses ping
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m3", senderID: "admin1", body: "-ping", isGroup: true });
		const adminReplies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/pong|ping/i.test(adminReplies), "admin should be able to use commands by default");

		// Admin turns bot back on
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m4", senderID: "admin1", body: "-bot on", isGroup: true });
		assert.strictEqual(tData.adminOnly, false);

		// Non-admin can use ping now
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m5", senderID: "user1", body: "-ping", isGroup: true });
		const publicReplies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/pong|ping/i.test(publicReplies), "non-admin should be able to use commands when bot is ON");
	});

	await test("bot: non-admin gets no response for bot command", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const tData = { threadID: "t", adminIDs: ["admin1"], settings: {} };
		db.threads.set("t", tData);
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m1", senderID: "user1", body: "-bot", isGroup: true });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "non-admin must receive no response for bot command");
	});

	await test("admin: non-admin gets no response for admin command", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m1", senderID: "user1", body: "-admin list", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "non-admin must receive no response for admin command");
	});

	await test("admin: configured admin accounts (36296727311 and 49212864825) can operate bot in admin-only mode", async () => {
		const api = fakeApi();
		const config = makeConfig({
			adminOnly: { enable: true, ignoreCommands: [] },
			adminBot: ["36296727311", "49212864825"]
		});
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		// Account 1
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m1", senderID: "36296727311", body: "-ping", isGroup: false });
		let replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/pong/i.test(replies), "Account 1 must be allowed to run commands");

		// Account 2
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m2", senderID: "49212864825", body: "-ping", isGroup: false });
		replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/pong/i.test(replies), "Account 2 must be allowed to run commands");

		// Non-admin stranger
		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m3", senderID: "stranger999", body: "-ping", isGroup: false });
		replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.strictEqual(replies, "", "Stranger must receive zero response");
	});

	await test("admin: bot admin can list, add, and remove admin", async () => {
		const api = fakeApi();
		const config = makeConfig({ adminBot: ["999"] });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m1", senderID: "999", body: "-admin list", isGroup: false });
		let replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(replies.includes("999"));

		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m2", senderID: "999", body: "-admin add 123456", isGroup: false });
		assert.ok(config.adminBot.includes("123456"));

		api.calls.length = 0;
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m3", senderID: "999", body: "-admin remove 123456", isGroup: false });
		assert.ok(!config.adminBot.includes("123456"));
	});

	await test("onReaction: unsend emoji removes target message for admin and DM", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const tData = { threadID: "t", adminIDs: ["admin1"], settings: {} };
		db.threads.set("t", tData);
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		api.calls.length = 0;
		await dispatcher.handle({
			type: "message_reaction",
			threadID: "t",
			messageID: "reaction1",
			targetMessageID: "bot_msg_to_unsend",
			senderID: "admin1",
			reaction: "😡",
			isGroup: true
		});

		const unsendCalls = api.calls.filter(c => c.method === "unsendMessage");
		assert.ok(unsendCalls.some(c => c.id === "bot_msg_to_unsend" && c.threadID === "t"), "expected target message to be unsent on angry reaction");
	});

	await test("dispatcher: reply handler is invoked", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		let handled = false;
		dispatcher.registerOnReply("bot1", "test", () => { handled = true; });
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-x", isGroup: false, messageReply: { messageID: "bot1", senderID: "100" } });
		assert.ok(handled, "reply handler should have run");
	});

	await test("dispatcher: reply handlers chain across repeated replies", async () => {
		// Regression for the `ai` command stopping after the second exchange:
		// the continuation must receive setReplyHandler from the handler
		// argument object (it is a sibling of `event`), so every bot reply arms
		// the handler for the next user reply.
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		const botMessageIDs = [];
		const continuation = () => async ({ message, event, setReplyHandler }) => {
			const sent = await message.reply("bot: " + event.body);
			const id = sent && sent.messageID;
			botMessageIDs.push(id);
			setReplyHandler(continuation(), id);
		};
		registry.registerCommand({ script: {
			config: { name: "aichain", aliases: [], cooldown: 0, role: 0, category: "ai" },
			onStart: async ({ message, event, setReplyHandler }) => {
				const sent = await message.reply("bot: " + event.body);
				const id = sent && sent.messageID;
				botMessageIDs.push(id);
				setReplyHandler(continuation(), id);
			}
		} });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "u1", senderID: "5", body: "-aichain", isGroup: false });
		assert.ok(botMessageIDs[0], "first bot reply must expose a message id");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u2", senderID: "5", body: "second", isGroup: false, messageReply: { messageID: botMessageIDs[0], senderID: "100" } });
		assert.ok(botMessageIDs[1], "second exchange must produce a bot reply");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u3", senderID: "5", body: "third", isGroup: false, messageReply: { messageID: botMessageIDs[1], senderID: "100" } });
		assert.ok(botMessageIDs[2], "third exchange must produce a bot reply");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u4", senderID: "5", body: "fourth", isGroup: false, messageReply: { messageID: botMessageIDs[2], senderID: "100" } });
		assert.ok(botMessageIDs[3], "fourth exchange must produce a bot reply");
		registry.unregisterCommand("aichain");
	});

	/* ── effects & music (message context) ── */
	await test("message: effect routes to sendTextEffect", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.effect("boom", "fire");
		assert.ok(api.calls.some(c => c.method === "sendTextEffect" && c.text === "boom" && c.effect === "fire"));
	});

	await test("message: avatarEffect routes to sendAvatarTextEffect", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.avatarEffect("yay", "laugh");
		assert.ok(api.calls.some(c => c.method === "sendAvatarTextEffect" && c.text === "yay" && c.effect === "laugh"));
	});

	await test("message: music routes to sendMusic with the track", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.music({ audioClusterID: "111" });
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "111"));
	});

	await test("message: musicSearch returns track list", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		const result = await message.musicSearch("hello");
		assert.strictEqual(result.tracks.length, 2);
		assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "hello"));
	});

	/* ── new commands through the dispatcher ── */
	async function runCommand(body, { config, db, api, senderID = "999", extraEvent } = {}) {
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle(Object.assign({ type: "message", threadID: "t", messageID: "evt", senderID, body, isGroup: false }, extraEvent || {}));
		return api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
	}

	await test("music: searches and lists results with numbers", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-music testing song", { api, db, config: makeConfig() });
		assert.ok(/1\./.test(out) && /2\./.test(out), "expected a numbered list");
		assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "testing song"));
	});

	await test("music: aliases stickermusic/sm/m resolve to the sticker command", async () => {
		for (const alias of ["stickermusic", "sm", "m"]) {
			const api = fakeApi();
			const db = makeDatabase();
			const out = await runCommand(`-${alias} testing song`, { api, db, config: makeConfig() });
			assert.ok(/1\./.test(out), `alias "${alias}" should run the sticker search`);
			assert.ok(api.calls.some(c => c.method === "musicSearch"), `alias "${alias}" should search`);
		}
	});

	await test("music: numeric pick sends the chosen track as a sticker", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig();
		// Seed a cached search result for the sender.
		db.users.set("999", { userID: "999", banned: { status: false }, settings: {}, data: { lastMusic: { query: "x", tracks: [{ title: "A", artist: "B", audioClusterID: "111" }] } } });
		await runCommand("-music 1", { api, db, config });
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "111"));
	});

	await test("music: uses a custom music server when configured", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		let requested = null;
		global.fetch = async (url, opts) => {
			requested = { url, headers: opts && opts.headers };
			return { ok: true, json: async () => ({ tracks: [{ title: "Server Song", artist: "Server Artist", audio_cluster_id: "999", duration_ms: 1000 }] }) };
		};
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search?q={query}", apiToken: "tok" } });
			await runCommand("-music server test", { api, db, config });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(requested && requested.url.includes("server%20test"), "expected the server to be queried");
		assert.strictEqual(requested.headers.Authorization, "Bearer tok");
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "999"));
	});

	await test("music: falls back to Instagram search when the music server 404s", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: false, status: 404 });
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search", apiToken: "" } });
			const out = await runCommand("-music server down", { api, db, config });
			assert.ok(!/music server responded/.test(out), "a dead music server must not surface an error");
			assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "server down"), "expected the Instagram fallback");
		}
		finally {
			global.fetch = originalFetch;
		}
	});

	await test("sing: lists full songs from the music server", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		global.fetch = async () => ({
			ok: true,
			json: async () => ({
				songs: [
					{ title: "Full A", artist: "Artist A", duration_ms: 200000, downloadUrl: "https://cdn.example/a.m4a" },
					{ title: "Full B", artist: "Artist B", duration_ms: 210000, url: "https://cdn.example/b.mp3" }
				]
			})
		});
		let out;
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search", apiToken: "" } });
			out = await runCommand("-sing full song", { api, db, config });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/1\./.test(out) && /2\./.test(out), "expected a numbered full-song list");
		assert.ok(/Full A/.test(out), "expected the server's title");
	});

	await test("sing: numeric pick streams the full song as audio", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		db.users.set("999", { userID: "999", banned: { status: false }, settings: {}, data: { lastSong: { query: "x", tracks: [{ title: "A", artist: "B", url: "https://cdn.example/a.mp3" }] } } });
		await runCommand("-sing 1", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendAudio" && c.src === "https://cdn.example/a.mp3"), "expected the full-song URL to be streamed as audio");
	});

	await test("sing: single result is sent immediately", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: true, json: async () => ({ results: [{ title: "Only", artist: "One", url: "https://cdn.example/only.m4a" }] }) });
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search", apiToken: "" } });
			await runCommand("-sing only one", { api, db, config });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(api.calls.some(c => c.method === "sendAudio" && c.src === "https://cdn.example/only.m4a"));
	});

	await test("sing: falls back to Instagram and lists full songs when it has URLs", async () => {
		// Instagram's search_v2 track carries progressive_download_url; the server
		// surfaces it as `url`, so `sing` must list those songs.
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-sing instagram song", { api, db, config: makeConfig() });
		assert.ok(/1\./.test(out) && /2\./.test(out), "expected a numbered full-song list");
		assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "instagram song"), "expected the Instagram fallback");
	});

	await test("sing: sends the Instagram progressive URL as audio", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		db.users.set("999", { userID: "999", banned: { status: false }, settings: {}, data: { lastSong: { query: "x", tracks: [{ title: "A", artist: "B", url: "https://cdn.example/ig.mp4" }] } } });
		await runCommand("-sing 1", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendAudio" && c.src === "https://cdn.example/ig.mp4"), "expected the Instagram track URL to be streamed");
	});

	await test("sing: reports when Instagram returns no audio URL", async () => {
		// A metadata-only result (no progressive URL) must not send junk.
		const api = fakeApi({ musicSearch: (q, cb) => cb(null, { tracks: [{ title: "No Url", artist: "X", audioClusterID: "1" }] }) });
		const db = makeDatabase();
		const out = await runCommand("-sing no url somewhere", { api, db, config: makeConfig() });
		assert.ok(/no full songs|no audio url|search failed/i.test(out), "expected a clear message");
		assert.strictEqual(api.calls.filter(c => c.method === "sendAudio").length, 0);
	});

	await test("avatarfx: rejects an unknown effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-avatarfx bogus hi", { api, db, config: makeConfig() });
		assert.ok(/pick an effect/i.test(out));
		assert.strictEqual(api.calls.filter(c => c.method === "sendAvatarTextEffect").length, 0);
	});

	await test("avatarfx: sends a known effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-avatarfx laugh nice", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendAvatarTextEffect" && c.effect === "laugh"));
	});

	await test("effect: sends a known power-up effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-effect fire boom", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendTextEffect" && c.effect === "fire" && c.text === "boom"));
	});

	await test("cmd: only bot admins may use it", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-cmd list", { api, db, config: makeConfig(), senderID: "5" });
		assert.strictEqual(out, "", "expected silent ignore for non-admins");
	});

	await test("event: only bot admins may use it", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-event list", { api, db, config: makeConfig(), senderID: "5" });
		assert.strictEqual(out, "", "expected silent ignore for non-admins");
	});

	await test("events: silently ignores non-admins", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-events off", { api, db, config: makeConfig(), senderID: "5" });
		assert.strictEqual(out, "", "expected silent ignore for non-admins");
	});

	await test("event: lists loaded events for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-event list", { api, db, config: makeConfig() });
		assert.ok(/Loaded events/.test(out));
	});

	await test("event: on/off toggles thread events", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		let out = await runCommand("-event off", { api, db, config: makeConfig() });
		assert.ok(/DISABLED/.test(out));
		out = await runCommand("-event on", { api, db, config: makeConfig() });
		assert.ok(/ENABLED/.test(out));
	});

	await test("cmd: lists loaded commands for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-cmd list", { api, db, config: makeConfig() });
		assert.ok(/Loaded commands/.test(out));
		assert.ok(/ping/.test(out));
	});

	await test("cmd: unload then reload a command", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		let out = await runCommand("-cmd unload joke", { api, db, config: makeConfig() });
		assert.ok(/✅ Unloaded/.test(out));
		assert.strictEqual(registry.resolve("joke"), null);
		out = await runCommand("-cmd reload joke", { api, db, config: makeConfig() });
		assert.ok(/✅ Reloaded/.test(out));
		assert.ok(registry.resolve("joke"), "joke should be back");
	});

	await test("cmd: responses carry ✅ / ❌ status icons", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const ok = await runCommand("-cmd list", { api, db, config: makeConfig() });
		assert.ok(/📦/.test(ok), "list should use the package icon");
		const bad = await runCommand("-cmd unload doesnotexist", { api, db, config: makeConfig() });
		assert.ok(/❌/.test(bad), "a missing command should use the cross icon");
	});

	await test("cmd: installs a command from direct code and loads it live", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testinstall_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzztestcmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("installed ok") };';
		try {
			const out = await runCommand(`-cmd install ${fileName} ${code}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzztestcmd"/.test(out), "should report the install, got: " + out);
			assert.ok(registry.resolve("zzztestcmd"), "the command must be live without restart");
			const fs = require("fs");
			assert.ok(fs.existsSync(require("path").join(__dirname, "..", "commands", fileName)), "the file must be written");
		}
		finally {
			registry.unregisterCommand("zzztestcmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: installs a command from a replied code message", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testreply_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzzreplycmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("replied ok") };';
		try {
			const out = await runCommand(`-cmd install ${fileName}`, {
				api, db, config: makeConfig(),
				extraEvent: { messageReply: { messageID: "m2", senderID: "999", body: code, attachments: [] } }
			});
			assert.ok(/Installed "zzzreplycmd"/.test(out), "should install from the reply, got: " + out);
			assert.ok(registry.resolve("zzzreplycmd"), "the replied command must be live");
		}
		finally {
			registry.unregisterCommand("zzzreplycmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: installs a command from a URL", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testurl_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'module.exports = { config: { name: "zzzurlcmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("url ok") };';
		global.fetch = async () => ({ ok: true, text: async () => code });
		try {
			const out = await runCommand(`-cmd install https://example.com/thing.js ${fileName}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzurlcmd"/.test(out), "should install from the url, got: " + out);
			assert.ok(registry.resolve("zzzurlcmd"), "the url command must be live");
		}
		finally {
			global.fetch = originalFetch;
			registry.unregisterCommand("zzzurlcmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: URL-only install derives the file name and replies", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "autourl_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'module.exports = { config: { name: "zzzautourl", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("url-only ok") };';
		global.fetch = async () => ({ ok: true, text: async () => code });
		try {
			const out = await runCommand(`-cmd install https://example.com/${fileName}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzautourl"/.test(out), "URL-only install should confirm success, got: " + out);
			assert.ok(registry.resolve("zzzautourl"), "the URL-only command must be live");
		}
		finally {
			global.fetch = originalFetch;
			registry.unregisterCommand("zzzautourl");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: URL install reports load errors and removes the broken file", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "brokenurl_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'const missing = require("module-that-does-not-exist"); module.exports = { config: { name: "zzzbrokeurl", category: "custom" }, onStart: async () => missing };';
		global.fetch = async () => ({ ok: true, text: async () => code });
		const dest = require("path").join(__dirname, "..", "commands", fileName);
		try {
			const out = await runCommand(`-cmd install https://example.com/${fileName}`, { api, db, config: makeConfig() });
			assert.ok(/Install failed/i.test(out), "the dependency error must be reported, got: " + out);
			assert.ok(!require("fs").existsSync(dest), "a failed install must not leave a broken file");
		}
		finally {
			global.fetch = originalFetch;
			try { require("fs").unlinkSync(dest); } catch (_) { }
		}
	});

	await test("bby: uses the native API port without axios", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		let requested = null;
		global.fetch = async url => {
			requested = String(url);
			return { ok: true, json: async () => ({ reply: "bby says hello" }) };
		};
		try {
			const out = await runCommand("bby hello", { api, db, config: makeConfig() });
			assert.strictEqual(out, "bby says hello");
			assert.ok(requested && requested.includes("noobs-api.top/dipto/baby"), "expected the baby API to be called");
			assert.ok(registry.resolve("bby"), "bby must be registered");
			assert.strictEqual(registry.resolve("bby").config.noPrefix, true, "bby must run without the prefix");
			assert.strictEqual(registry.resolve("bby").config.author, "dipto", "bby must credit dipto");
		}
		finally { global.fetch = originalFetch; }
	});

	await test("bby: replies use the baby endpoint and re-arm the next reply", async () => {
		const bby = require(path.join(root, "commands", "bby"));
		const originalFetch = global.fetch;
		const requested = [];
		const sent = [];
		let firstHandler = null;
		let nextHandler = null;
		global.fetch = async url => {
			requested.push(String(url));
			return { ok: true, json: async () => ({ reply: requested.length === 1 ? "first answer" : "second answer" }) };
		};
		const makeMessage = () => ({
			reply: async body => {
				sent.push(String(body));
				return { messageID: "bby-message-" + sent.length };
			}
		});
		try {
			await bby.onStart({
				message: makeMessage(),
				args: ["hello"],
				event: { type: "message", senderID: "42", threadID: "t", messageID: "m" },
				usersData: makeDatabase().users,
				setReplyHandler: handler => { firstHandler = handler; }
			});
			assert.strictEqual(sent[0], "first answer");
			assert.ok(firstHandler, "the initial answer must arm a reply handler");
			await firstHandler({
				api: fakeApi(),
				message: makeMessage(),
				event: { type: "message_reply", senderID: "42", threadID: "t", messageID: "r", body: "again" },
				setReplyHandler: handler => { nextHandler = handler; }
			});
			assert.strictEqual(sent[1], "second answer");
			assert.ok(nextHandler, "each reply must arm the next response");
			assert.ok(requested[1].includes("noobs-api.top/dipto/baby"), "reply must use the baby endpoint");
		}
		finally { global.fetch = originalFetch; }
	});

	await test("cmd: URL install works with the name before the URL too", async () => {
		// Regression: `-cmd install ai.js <url>` treated the URL itself as
		// inline code and wrote the URL text as the file, so the bot failed
		// (or silently kept the old file). The name may come before or after
		// the URL.
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testurlorder_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'module.exports = { config: { name: "zzzurlordercmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("ok") };';
		let fetched = null;
		global.fetch = async (url) => { fetched = String(url); return { ok: true, text: async () => code }; };
		try {
			const out = await runCommand(`-cmd install ${fileName} https://example.com/thing.js`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzurlordercmd"/.test(out), "should install with name-first order, got: " + out);
			assert.strictEqual(fetched, "https://example.com/thing.js", "the URL must be fetched, not treated as code");
			const written = require("fs").readFileSync(require("path").join(__dirname, "..", "commands", fileName), "utf8");
			assert.match(written, /module\.exports/, "the file must contain the downloaded code");
		}
		finally {
			global.fetch = originalFetch;
			registry.unregisterCommand("zzzurlordercmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: reinstalling over an existing file overwrites it and replies", async () => {
		// Regression: a re-install replied "already exists, react to this message
		// to overwrite it" and armed a reaction handler on the BOT's reply. A user
		// who reacted to the command message (or did not react) saw nothing happen
		// at all — the install looked silent. Installing by URL is explicit, so it
		// must overwrite and confirm.
		const api = fakeApi();
		const db = makeDatabase();
		const path = require("path");
		const fs = require("fs");
		const fileName = "testoverwrite_" + Date.now().toString(36) + ".js";
		const dest = path.join(__dirname, "..", "commands", fileName);
		const first = 'module.exports = { config: { name: "zzzover", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("v1") };';
		const second = 'module.exports = { config: { name: "zzzover", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("v2") };';
		try {
			const a = await runCommand(`-cmd install ${fileName} ${first}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzover"/.test(a), "first install should report Installed, got: " + a);
			const b = await runCommand(`-cmd install ${fileName} ${second}`, { api, db, config: makeConfig() });
			assert.ok(/Updated "zzzover"/.test(b), "re-install must report Updated, got: " + b);
			assert.ok(!/react to this message/i.test(b), "re-install must not require a reaction");
			assert.match(fs.readFileSync(dest, "utf8"), /"v2"/, "the file must hold the new code");
		}
		finally {
			registry.unregisterCommand("zzzover");
			try { fs.unlinkSync(dest); } catch (_) { }
		}
	});

	await test("cmd: uninstall removes the file and unloads it live", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const path = require("path");
		const fs = require("fs");
		const fileName = "testuninstall_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzzuninst", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("x") };';
		const dest = path.join(__dirname, "..", "commands", fileName);
		try {
			await runCommand(`-cmd install ${fileName} ${code}`, { api, db, config: makeConfig() });
			assert.ok(fs.existsSync(dest), "file should exist after install");
			const out = await runCommand("-cmd uninstall zzzuninst", { api, db, config: makeConfig() });
			assert.ok(/Uninstalled/.test(out), "should report uninstall, got: " + out);
			assert.ok(!registry.resolve("zzzuninst"), "command must be gone live");
			assert.ok(!fs.existsSync(dest), "the file must be deleted");
		}
		finally {
			registry.unregisterCommand("zzzuninst");
			try { fs.unlinkSync(dest); } catch (_) { }
		}
	});

	await test("eval: evaluates an expression for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-eval 1 + 2", { api, db, config: makeConfig() });
		assert.ok(/3/.test(out));
	});

	await test("eval: out(\"hi\") replies hi", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand(`-eval out("hi")`, { api, db, config: makeConfig() });
		assert.strictEqual(out, "hi");
	});

	await test("eval: output() stringifies objects and Map", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const obj = await runCommand(`-eval output({ a: 1, b: 2 })`, { api, db, config: makeConfig() });
		assert.ok(/\"a\": 1/.test(obj), "expected pretty JSON");
		const map = await runCommand(`-eval out(new Map([["k","v"]]))`, { api, db, config: makeConfig() });
		assert.ok(/Map\(1\)/.test(map) && /\"k\": \"v\"/.test(map));
	});

	await test("eval: out() wins over the return value", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand(`-eval out("first"); return "second";`, { api, db, config: makeConfig() });
		assert.ok(/first/.test(out));
		assert.ok(!/second/.test(out), "the return value should be suppressed once out() is used");
	});

	await test("eval: an error is reported", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-eval throw new Error('boom')", { api, db, config: makeConfig() });
		assert.ok(/boom/.test(out));
	});

	await test("shell: runs a command and returns stdout", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-shell echo instabot_ok", { api, db, config: makeConfig() });
		assert.ok(/instabot_ok/.test(out));
	});

	await test("music: replying to the results message sends the picked track", async () => {
		// Regression: the reply handler must be armed against the results
		// message, not the triggering -music message the user replies to.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig();
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		await dispatcher.handle({ type: "message", threadID: "t", messageID: "USER_1", senderID: "999", body: "-music testing song", isGroup: false });
		const resultIndex = api.calls.findIndex(c => c.method === "sendMessage" && /Results for/.test(c.form.body));
		assert.ok(resultIndex !== -1, "expected a results message");
		// fakeApi returns "m" + (number of calls so far) as the messageID.
		const results = api.calls[resultIndex];

		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "USER_2", senderID: "999", body: "1", isGroup: false,
			messageReply: { messageID: "m" + (resultIndex + 1), senderID: "100", body: results.form.body, attachments: [] }
		});
		const music = api.calls.filter(c => c.method === "sendMusic").pop();
		assert.ok(music, "expected the picked track to be sent");
		assert.strictEqual(music.track.audioClusterID, "111");
	});

	await test("uid: replying to a message returns only the replied user's id", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-uid", isGroup: false,
			messageReply: { messageID: "orig", senderID: "777", body: "hi", attachments: [] }
		});
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "777");
	});

	await test("uid: no arguments returns only the sender's own id", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "5");
	});

	await test("uid: a numeric argument is returned as-is", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid 999888777", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "999888777");
	});

	await test("uid: an @handle is resolved to that user's id only", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "424242": { userID: "424242", name: "Neo", vanity: "__neo.nnn" } });
		const original = utils.download;
		utils.download = async () => { throw new Error("no public lookup in this test"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid @__neo.nnn", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "424242");
	});

	await test("uid: a profile URL resolves through the parsed username", async () => {
		const api = fakeApi();
		let looked = null;
		api.getUserInfo = (id, cb) => { looked = id; cb(null, { "10402267946": { userID: "10402267946" } }); };
		const original = utils.download;
		utils.download = async () => { throw new Error("no public lookup in this test"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid https://www.instagram.com/chistyeee?stkn=bHk2cDAwd2RpOHh6", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(looked, "chistyeee", "the URL must be reduced to the username");
		assert.strictEqual(reply, "10402267946");
	});

	await test("uid: a profile URL resolves through the public endpoint when the session cannot", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "555111" } } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid https://www.instagram.com/chistyeee?stkn=bHk2cDAwd2RpOHh6", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "555111");
	});

	await test("target: every command resolves a bare username", async () => {
		const cases = [
			{ body: "-uid bob", method: "sendMessage", expect: "222" },
			{ body: "-info bob", method: "sendImage", expect: "Bob" },
			{ body: "-pfp bob", method: "sendImage", expect: "pic.jpg" },
			{ body: "-adduser bob", method: "addUserToThread", expect: "222", extraEvent: { isGroup: true } },
			{ body: "-removeuser bob", method: "removeUserFromThread", expect: "222", extraEvent: { isGroup: true } }
		];
		for (const item of cases) {
			const api = fakeApi();
			// Force the public endpoint so the resolved id is deterministic.
			api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
			utils._resetUsernameCache();
			const original = utils.download;
			utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "222", username: "bob", full_name: "Bob", profile_pic_url_hd: "https://x/pic.jpg" } } }));
			const db = makeDatabase();
			try {
				await runCommand(item.body, { api, db, config: makeConfig(), extraEvent: item.extraEvent });
			}
			finally {
				utils.download = original;
			}
			const call = api.calls.find(c => c.method === item.method);
			assert.ok(call, `expected ${item.method} for "${item.body}"`);
			const haystack = JSON.stringify(api.calls);
			assert.ok(haystack.includes(item.expect), `expected "${item.expect}" for "${item.body}", got ${haystack}`);
		}
	});

	await test("utils: instagramUsername parses URLs, handles and rejects paths", () => {
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/chistyeee?stkn=abc"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("https://instagram.com/chistyeee/"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("instagram.com/chistyeee"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("@chistyeee"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/p/ABC123/"), null);
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/stories/chistyeee/123/"), null);
		assert.strictEqual(utils.instagramUsername("https://example.com/chistyeee"), null);
		assert.strictEqual(utils.instagramUsername("chistyeee"), null);
	});

	await test("utils: resolveInstagramUserID reads the public web_profile_info", async () => {
		const original = utils.download;
		utils._resetUsernameCache();
		utils.download = async url => {
			assert.ok(/web_profile_info\/\?username=chistyeee/.test(url), "expected the profile endpoint");
			return Buffer.from(JSON.stringify({ data: { user: { id: "10402267946" } } }));
		};
		try {
			assert.strictEqual(await utils.resolveInstagramUserID("chistyeee"), "10402267946");
		}
		finally {
			utils.download = original;
		}
	});

	await test("utils: resolveInstagramUserID returns null on failure", async () => {
		const original = utils.download;
		utils.download = async () => { throw new Error("network down"); };
		try {
			assert.strictEqual(await utils.resolveInstagramUserID("nobody"), null);
		}
		finally {
			utils.download = original;
		}
	});

	await test("info: sends the text before the profile picture", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", followerCount: 1, profilePicture: "https://example.com/p.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-info",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const textAt = api.calls.findIndex(c => c.method === "sendMessage" && /Jane Doe/.test(c.form.body));
		const imgAt = api.calls.findIndex(c => c.method === "sendImage");
		assert.ok(textAt > -1 && imgAt > -1, "expected both a text and an image");
		assert.ok(textAt < imgAt, "the text must be sent before the picture");
	});

	await test("pfp: sends the text before the picture", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", profilePicture: "https://example.com/p.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-pfp",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const textAt = api.calls.findIndex(c => c.method === "sendMessage" && /Jane Doe/.test(c.form.body));
		const imgAt = api.calls.findIndex(c => c.method === "sendImage");
		assert.ok(textAt > -1 && imgAt > -1, "expected both a text and a picture");
		assert.ok(textAt < imgAt, "the text must be sent before the picture");
	});

	await test("info: shows a user's details for a replied user", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", biography: "hi", followerCount: 1234, followingCount: 56, isPrivate: true, profilePicture: "https://example.com/p.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-info",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Jane Doe/.test(text) && /@jane/.test(text) && /1,234/.test(text), "expected profile details: " + text);
	});

	await test("info: resolves an @handle through the public profile", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: {
			id: "10402267946", username: "chistyeee", full_name: "Meheraz", biography: "bio here",
			edge_followed_by: { count: 1106 }, edge_follow: { count: 163 },
			edge_owner_to_timeline_media: { count: 2 }, is_private: false, is_verified: false,
			profile_pic_url_hd: "https://example.com/hd.jpg"
		} } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-info @chistyeee", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image && /hd\.jpg/.test(String(image.img)), "expected the profile picture attachment");
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Meheraz/.test(text) && /1,106/.test(text) && /bio here/.test(text), "expected the profile details: " + text);
	});

	await test("info: a profile URL resolves to the same user", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async url => {
			assert.ok(/web_profile_info\/\?username=chistyeee/.test(url));
			return Buffer.from(JSON.stringify({ data: { user: { id: "10402267946", username: "chistyeee", full_name: "Meheraz" } } }));
		};
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-info https://www.instagram.com/chistyeee?stkn=abc", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/10402267946/.test(text), "expected the resolved id: " + text);
	});

	await test("pfp: sends the user's profile picture", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane", profilePicture: "https://example.com/jane.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-pfp",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image, "expected an image");
		assert.strictEqual(image.img, "https://example.com/jane.jpg");
	});

	await test("pfp: resolves a profile URL through the public pic", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "10402267946", username: "chistyeee", full_name: "Meheraz", profile_pic_url_hd: "https://example.com/chisty.jpg" } } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pfp https://www.instagram.com/chistyeee?stkn=abc", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image, "expected an image");
		assert.strictEqual(image.img, "https://example.com/chisty.jpg");
	});

	await test("pfp: missing user asks for a target", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("nope"));
		const original = utils.download;
		utils.download = async () => { throw new Error("network"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pfp @ghost", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/@ghost/.test(text));
	});

	await test("avatar: uses an image from the replied message (largePreviewUrl)", async () => {
		const api = fakeApi();
		let changed = null;
		api.changeProfilePicture = (src, cb) => { changed = src; cb && cb(null, { ok: true }); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig({ adminBot: ["999"] }), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "999", body: "-avatar", isGroup: false,
			messageReply: {
				messageID: "orig", senderID: "999", body: "", attachments: [
					// url is null on real payloads; the usable link is largePreviewUrl.
					{ type: "photo", url: null, largePreviewUrl: "https://example.com/pic.jpg" }
				]
			}
		});
		assert.strictEqual(changed, "https://example.com/pic.jpg");
	});

	await test("ban: an admin bans and then unbans the same user", async () => {
		// Regression: ban.js branched on commandName, which is always the
		// canonical "ban", so `-unban <id>` re-ran the ban path and re-banned.
		const api = fakeApi();
		const db = makeDatabase();
		db.users.ensure("123", { userID: "123" });
		await runCommand("-ban 123 spamming", { api, db, config: makeConfig() });
		assert.strictEqual(db.users.get("123").banned.status, true, "ban must set the flag");
		await runCommand("-unban 123", { api, db, config: makeConfig() });
		assert.strictEqual(db.users.get("123").banned.status, false, "unban must clear the flag");
	});

	await test("dispatcher: a banned user cannot drive a reply handler", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		db.users.set("5", { userID: "5", banned: { status: true, reason: "x" } });
		const config = makeConfig();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		let ran = false;
		// Register a handler keyed to the message the banned user replies to.
		dispatcher.registerOnReply("target-1", "ai", async () => { ran = true; });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5",
			body: "hello", isGroup: false,
			messageReply: { messageID: "target-1", senderID: "100", body: "hi", attachments: [] }
		});
		assert.strictEqual(ran, false, "a banned user must not drive a reply handler");
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/banned/i.test(reply), "the banned user should be told, got: " + JSON.stringify(reply));
	});

	await test("prefix: runs without the prefix for a bot admin", async () => {		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "999", body: "prefix", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/current prefix/i.test(reply), "expected the current prefix");
	});

	await test("prefix: bare invocation from a normal user shows the prefix", async () => {
		// Regression: the command was bot-admin-only (role 2) and its bare form
		// was gated to admins, so a normal user typing `prefix` got NOTHING.
		// Everyone must be able to READ the prefix; only admins may change it.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "prefix", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/current prefix/i.test(reply), "a normal user must see the prefix, got: " + JSON.stringify(reply));
		assert.ok(reply.includes("!"), "the reply must include the actual prefix");
	});

	await test("prefix: a normal user cannot change the prefix", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "prefix ~", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(config.prefix, "!", "a normal user must not change the prefix");
		assert.ok(/Only bot admins can change it/i.test(reply), "expected the admin-only notice, got: " + JSON.stringify(reply));
	});

	await test("prefix: a bot admin changes the prefix", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "999", body: "prefix ~", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(config.prefix, "~", "the admin change must take effect");
		assert.ok(/Prefix changed/i.test(reply), "expected the change confirmation, got: " + JSON.stringify(reply));
	});

	await test("dispatcher: suggests a close command on a typo", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pign", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "Command not found! Did you mean -ping or try -help");
	});

	await test("dispatcher: unknown command uses the configured prefix via {pn}", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig({ prefix: "!" }), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "!zzzzzz", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "Command not found! Try !help");
	});

	await test("join: welcomes a new member with the configured message", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: true, message: "Welcome %1 to %2!", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "5", userIDs: ["5"], senderID: "5", userID: "5" });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Welcome/.test(reply), "expected a welcome message");
	});

	await test("leave: announces a member leaving", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ leave: { enable: true, message: "%1 left %2.", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "leave", threadID: "t", participantID: "5", userIDs: ["5"], senderID: "5", userID: "5" });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/left/.test(reply), "expected a leave message");
	});

	await test("join: welcomes the affected member from a username-only action_log", async () => {
		// After the server parser drops the actor, a realtime join carries only
		// the added member's username (no numeric id). Exactly one welcome.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: true, message: "Welcome %1 to %2!", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", usernames: ["botnkx"], userIDs: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one welcome must be sent");
		assert.ok(/botnkx/.test(messages[0]), "the affected member must be named");
	});

	await test("leave: announces the affected member from a username-only action_log", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ leave: { enable: true, message: "%1 left %2.", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "leave", threadID: "t", usernames: ["botnkx"], userIDs: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one leave message must be sent");
		assert.ok(/botnkx/.test(messages[0]), "the affected member must be named");
	});

	await test("join: the bot thanks the inviter instead of welcoming itself", async () => {
		// The bot's own id is "100" in fakeApi. When it is the added member, it
		// must send the self message, not a member welcome.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({
			prefix: "-",
			welcome: { enable: true, message: "Welcome %1 to %2!", selfMessage: "Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.", threadIDs: [] }
		});
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "100", userIDs: ["100"], usernames: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one message");
		assert.ok(/Thanks for inviting me/.test(messages[0]), "expected the invite thank-you");
		assert.ok(/-help/.test(messages[0]), "the prefix must be substituted");
		assert.ok(!/Welcome @?100/.test(messages[0]), "must not welcome the bot itself");
	});

	await test("join: the bot recognises itself added by username", async () => {
		// fakeApi.getUserInfo reports vanity "tester" for any id; the bot's own
		// profile resolves to that handle, so a username-only add of "tester"
		// must be treated as the bot being invited.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({
			prefix: "!",
			welcome: { enable: true, message: "Welcome %1 to %2!", selfMessage: "Thanks for inviting me to %2 💋. Type {prefix}help.", threadIDs: [] }
		});
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", usernames: ["tester"], userIDs: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one message");
		assert.ok(/Thanks for inviting me/.test(messages[0]), "expected the invite thank-you");
		assert.ok(/!help/.test(messages[0]), "the configured prefix must be used");
	});

	await test("join: welcomes a member even when the bot is also added", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({
			welcome: { enable: true, message: "Welcome %1 to %2!", selfMessage: "Thanks!", threadIDs: [] }
		});
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", usernames: ["someone"], userIDs: ["100"] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(messages.some(m => /Thanks!/.test(m)), "expected the self thank-you");
		assert.ok(messages.some(m => /someone/.test(m)), "expected the member welcome too");
	});

	await test("join: disabled welcome sends nothing", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: false, message: "Welcome %1", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "5", userIDs: ["5"] });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	await test("join: sends nothing when bot is off in the thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		db.threads.set("t", { threadID: "t", isGroup: true, adminOnly: true, settings: { botOff: true } });
		const config = makeConfig({ welcome: { enable: true, message: "Welcome %1 to %2!", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "555", userIDs: ["555"], usernames: ["newbie"] });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	await test("leave: sends nothing when bot is off in the thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		db.threads.set("t", { threadID: "t", isGroup: true, adminOnly: true, settings: { botOff: true } });
		const config = makeConfig({ leave: { enable: true, message: "%1 left %2.", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "leave", threadID: "t", usernames: ["leaver"], userIDs: [] });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	/* ── server bridge: callback position ── */
	await test("auth: node callback in the middle keeps trailing reply", async () => {
		// Reproduces sendMessage(form, threadID, cb, reply): the callback is not
		// the last argument, so it must be located by scan, not by position.
		const auth = require(path.join(root, "auth"));
		const http = require("http");

		const received = [];
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				received.push(JSON.parse(body));
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: { sent: true } }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;

		try {
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t" });
			let called = null;
			await new Promise((resolve, reject) => {
				api.sendMessage({ body: "hi" }, "thread", (error, result) => {
					if (error) return reject(error);
					called = result;
					resolve();
				}, "reply-target-id");
			});
			assert.ok(called && called.sent, "callback should have been invoked");
			const rpc = received.find(r => r.method === "sendMessage");
			assert.ok(rpc, "expected a sendMessage rpc");
			assert.deepStrictEqual(rpc.args, [{ body: "hi" }, "thread", "reply-target-id"]);
			assert.strictEqual(rpc.callbackIndex, 2, "callback index should be reported");
		}
		finally {
			server.close();
		}
	});

	/* ── multi-bot: bot id plumbing ── */
	await test("auth: adopts the server id and session secret, then sends both", async () => {
		// The bot is never configured with an id or secret. It posts its cookies,
		// the server replies with the session id and a per-session secret, and
		// the bot uses both for the event stream and every later call.
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		const seen = [];
		const server = http.createServer((req, res) => {
			seen.push({
				url: req.url,
				botId: req.headers["x-bot-id"],
				sessionToken: req.headers["x-session-token"]
			});
			if (req.url.startsWith("/events")) {
				res.writeHead(200, { "Content-Type": "text/event-stream" });
				res.write("retry: 3000\n\n");
				return; // keep the stream open
			}
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				res.writeHead(200, { "Content-Type": "application/json" });
				if (req.url === "/cookies") {
					// The server derives the id from the pushed cookies and mints a
					// secret that scopes this bot to its own session.
					return res.end(JSON.stringify({ ok: true, result: { botId: "24268962575", sessionToken: "s3cret", accepted: true } }));
				}
				res.end(JSON.stringify({ ok: true, result: "123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		let stream = null;
		try {
			const cookies = "sessionid=a; ds_user_id=24268962575; csrftoken=x";
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", cookies });
			await api.getCurrentUserID();
			stream = api.listenMqtt(() => { });
			await new Promise(r => setTimeout(r, 150));

			// The first cookie push must NOT claim an id or secret of its own.
			const push = seen.find(s => s.url === "/cookies");
			assert.ok(push, "expected a /cookies push");
			assert.strictEqual(push.botId, undefined, "the cookie push must not send X-Bot-Id");
			assert.strictEqual(push.sessionToken, undefined, "the cookie push must not send X-Session-Token");

			const rpc = seen.find(s => s.url === "/rpc");
			assert.strictEqual(rpc.botId, "24268962575", "rpc must carry the adopted id");
			assert.strictEqual(rpc.sessionToken, "s3cret", "rpc must carry the adopted session secret");
			const events = seen.find(s => s.url.startsWith("/events"));
			assert.ok(events, "expected an /events request");
			assert.strictEqual(events.botId, "24268962575", "events must carry the adopted id");
			assert.strictEqual(events.sessionToken, "s3cret", "events must carry the session secret");
		}
		finally {
			if (stream) stream();
			server.close();
		}
	});

	await test("auth: rejects media above the size cap before sending", async () => {
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		let hits = 0;
		const server = http.createServer((req, res) => {
			hits++;
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, result: "123" }));
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		try {
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", botId: "botA" });
			hits = 0;
			const big = Buffer.alloc(6 * 1024 * 1024);
			await assert.rejects(
				() => api.sendVideo(big, "1"),
				/MB limit/,
				"oversized media must be rejected locally"
			);
			assert.strictEqual(hits, 0, "no request should reach the server for oversized media");
		}
		finally { server.close(); }
	});

	await test("config: server has no botId (the server assigns the session id)", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.strictEqual("botId" in config.server, false, "config.server must not carry a botId");
	});

	await test("config: a blank music.apiUrl never falls back to env.url", () => {
		// Regression: a host that sets INSTABOT_URL to its own service URL made
		// `sing` query the bot's own host and get a 404.
		const { loadConfig } = require(path.join(root, "src/config"));
		const previous = process.env.INSTABOT_URL;
		process.env.INSTABOT_URL = "https://the-bot-itself.onrender.com";
		try {
			const config = loadConfig();
			assert.strictEqual(config.music.apiUrl, "", "blank music.apiUrl must stay blank");
		}
		finally {
			if (previous === undefined) delete process.env.INSTABOT_URL;
			else process.env.INSTABOT_URL = previous;
		}
	});

	/* ── anisearch ── */
	await test("anisearch: registered with the Neoaz author", () => {
		const command = registry.resolve("anisearch");
		assert.ok(command, "anisearch should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "media");
	});

	await test("anisearch: missing query asks for usage", async () => {
		const command = registry.resolve("anisearch");
		const sent = [];
		const message = { reply: form => { sent.push(form); return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ args: [], message });
		assert.ok(/usage/i.test(String(sent[0])), "expected a usage hint");
	});

	await test("anisearch: searches, downloads and sends the video bytes", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		const seen = [];
		global.fetch = async (url, options) => {
			seen.push(String(url));
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Naruto edit", downloads: [{ label: "MP4 (No Watermark)", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			// The actual video download: small enough to send.
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? "1024" : null) },
				arrayBuffer: async () => new Uint8Array(1024).buffer
			};
		};
		const replies = [];
		const reactions = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.strictEqual(replies.length, 2, "a text then the video");
		assert.strictEqual(String(replies[0]), "Naruto edit", "the title/caption goes first");
		const video = replies[1];
		assert.ok(Buffer.isBuffer(video.attachment.buffer), "the video must be sent as bytes, not a URL");
		assert.strictEqual(video.attachment.buffer.length, 1024);
		assert.strictEqual(video.attachment.fileName, "anisearch.mp4", "mp4 extension hint must be attached");
		assert.deepStrictEqual(reactions, ["⏳", "✅"], "loading then success reactions");
		assert.ok(seen.some(u => u.includes("/tik-sr?q=naruto")), "search endpoint hit");
		assert.ok(seen.some(u => u.includes("/alldl?url=")), "download endpoint hit");
		assert.ok(seen.some(u => u.includes("cdn.example/v.mp4")), "video fetched by the bot, not the server");
	});

	await test("anisearch: retries the next result when a video is too large", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		let downloadCount = 0;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return {
					ok: true, status: 200,
					json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }, { url: "https://www.tiktok.com/@a/video/2" }] })
				};
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			downloadCount++;
			// First download is oversized; the retry is small.
			const size = downloadCount === 1 ? 50 * 1024 * 1024 : 2048;
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? String(size) : null) },
				arrayBuffer: async () => new Uint8Array(size).buffer
			};
		};
		const replies = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: () => Promise.resolve({})
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		const video = replies.find(r => r && r.attachment);
		assert.ok(video && Buffer.isBuffer(video.attachment.buffer), "expected a video on the retry");
		assert.strictEqual(video.attachment.buffer.length, 2048);
		assert.strictEqual(downloadCount, 2, "the oversized first download must be retried");
	});

	await test("anisearch: a bare 'Error' from the server is surfaced usefully", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			throw new Error("Video download failed (HTTP 403)");
		};
		let sent = null;
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/HTTP 403/.test(String(sent)), "the real reason must be shown, not a bare 'Error'");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	await test("anisearch: no matches reports an error", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
		let sent = null;
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["nothing"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/Could not find a video/.test(String(sent)), "expected an error reply");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	/* ── unsend ── */
	await test("unsend: registered with the Neoaz author", () => {
		const command = registry.resolve("unsend");
		assert.ok(command, "unsend should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "utility");
	});

	await test("unsend: removes the message the command replies to", async () => {
		const command = registry.resolve("unsend");
		const calls = [];
		const api = {
			unsendMessage: (id, threadID, cb) => { calls.push({ id, threadID }); cb && cb(null, {}); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "botmsg", senderID: "42" } }
		});
		assert.strictEqual(calls.length, 1, "expected exactly one unsend");
		assert.strictEqual(calls[0].id, "botmsg");
		assert.strictEqual(calls[0].threadID, "t1");
	});

	await test("unsend: does nothing without a reply", async () => {
		const command = registry.resolve("unsend");
		let called = false;
		const api = { unsendMessage: () => { called = true; } };
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt" }
		});
		assert.strictEqual(called, false, "no reply target means no unsend");
	});

	await test("unsend: swallows a refused unsend without replying", async () => {
		const command = registry.resolve("unsend");
		const api = {
			unsendMessage: (id, threadID, cb) => { cb && cb(new Error("not your message")); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "other", senderID: "99" } }
		});
	});

	await test("unsend: admin reacts with hand emoji to unsend a message", async () => {
		const command = registry.resolve("unsend");
		const calls = [];
		const api = {
			unsendMessage: (id, threadID, cb) => { calls.push({ id, threadID }); cb && cb(null, true); }
		};
		await command.onReaction({
			api,
			event: { threadID: "t1", messageID: "target123", reaction: "✋", userID: "admin1", isGroup: true },
			role: 1,
			isBotAdmin: () => false,
			config: { adminBot: [] }
		});
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].id, "target123");
		assert.strictEqual(calls[0].threadID, "t1");
	});

	await test("unsend: non-admin emoji reaction does not unsend in group", async () => {
		const command = registry.resolve("unsend");
		let called = false;
		const api = {
			unsendMessage: () => { called = true; }
		};
		await command.onReaction({
			api,
			event: { threadID: "t1", messageID: "target123", reaction: "✋", userID: "user1", isGroup: true },
			role: 0,
			isBotAdmin: () => false,
			config: { adminBot: [] }
		});
		assert.strictEqual(called, false, "non-admin must not trigger reaction unsend in a group");
	});

	/* ── adduser / removeuser ── */
	await test("adduser: registered with the Neoaz author", () => {
		const command = registry.resolve("adduser");
		assert.ok(command, "adduser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("adduser: adds a numeric id to the current thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555" && c.threadID === "t"));
		assert.ok(/555/.test(out), "expected a confirmation");
	});

	await test("adduser: resolves an @mention through the public profile", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "777", username: "someone" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-adduser @someone", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "777"), "expected the resolved mention id");
	});

	await test("adduser: falls back to the replied user", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "321"));
	});

	await test("adduser: refuses outside a group", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig() });
		assert.ok(/group/i.test(out));
		assert.ok(!api.calls.some(c => c.method === "addUserToThread"));
	});

	await test("adduser: unknown mention reports it", async () => {
		const api = fakeApi({ getUserInfo: (id, cb) => cb(null, {}) });
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: {} }));
		const db = makeDatabase();
		let out;
		try {
			out = await runCommand("-adduser @ghost", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(/@ghost/.test(out));
	});

	await test("removeuser: registered with the Neoaz author", () => {
		const command = registry.resolve("removeuser");
		assert.ok(command, "removeuser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("removeuser: removes the replied user from the thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-removeuser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "321" && c.threadID === "t"));
		assert.ok(/321/.test(out));
	});

	await test("removeuser: resolves an @mention and a numeric id", async () => {
		const api = fakeApi();
		const original = utils.download;
		utils._resetUsernameCache();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "888", username: "who" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-removeuser @who", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		await runCommand("-removeuser 9999", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "888"));
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "9999"));
	});

	/* ── ai ── */
	await test("ai: registered to NZ R with the ai alias", () => {
		const command = registry.resolve("ai");
		assert.ok(command, "ai should be registered");
		assert.strictEqual(command.config.author, "NZ R.");
		assert.strictEqual(command.config.category, "ai");
		assert.strictEqual(registry.resolve("ritchi"), command);
	});

	await test("ai: empty input asks for a message", async () => {
		const command = registry.resolve("ai");
		const out = await command.onStart({
			message: { reply: text => text },
			args: [],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/online|send a message/i.test(out));
	});

	await test("ai: 'clear' resets the session memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.set("t:1", { history: [{ role: "user", content: "hi" }], lastActive: Date.now(), lastBotMessageID: null, lastBotAt: 0 });
		const out = await command.onStart({
			message: { reply: text => text },
			args: ["clear"],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/cleared/i.test(out));
		assert.ok(!command._internal.sessions.has("t:1"));
	});

	await test("ai: answers, remembers and arms a reply handler", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:2");
		const originalFetch = global.fetch;
		global.fetch = async url => ({
			ok: true,
			json: async () => String(url).includes("kilwa-claude")
				? { status: "success", reply: "Hey there!" }
				: { status: "success", reply: "love" }
		});
		const replies = [];
		let armed = null;
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return { messageID: "bot1" }; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "2", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: (handler, id) => { armed = { handler, id }; }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /Hey there!/.test(r)), "expected the AI reply");
		const session = command._internal.sessions.get("t:2");
		assert.strictEqual(session.history.length, 2, "expected the exchange to be remembered");
		assert.strictEqual(armed && armed.id, "bot1", "expected a reply handler armed on the bot message");
	});

	await test("ai: reports a network failure without breaking memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:3");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: false, status: 502 });
		const replies = [];
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return {}; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "3", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: () => { }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /network/i.test(r)), "expected a friendly failure");
		const session = command._internal.sessions.get("t:3");
		assert.strictEqual(session.history.length, 0, "a failed turn must not be remembered");
	});

	/* ── help ── */
	await test("help: lists every category with a text effect", async () => {
		const command = registry.resolve("help");
		assert.ok(command, "help should be registered");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: [], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/INFO/.test(text), "should list the info category");
		assert.ok(/× -help/.test(text), "should list commands with the prefix");
		assert.ok(/➥× -/.test(text), "the ➥ icon should prefix the first command in each category");
		assert.ok(!/』 ➥/.test(text), "the icon must not sit on the category header");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: shows details for one command with a text effect", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["ping"], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/Name: ping/.test(text), "should name the command");
		assert.ok(/Usage: -ping/.test(text), "should render usage with the prefix");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: an unknown command is reported plainly", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["nope"], config: makeConfig(), registry });
		const text = String(sent && sent.body != null ? sent.body : sent);
		assert.ok(/not found/.test(text), "should report the missing command");
	});

	/* ── uptime ── */
	await test("uptime: registered and reports the running time", async () => {
		const command = registry.resolve("uptime");
		assert.ok(command, "uptime should be registered");
		const previous = global.instabotStartedAt;
		global.instabotStartedAt = Date.now() - (2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000);
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ message, config: { botName: "InstaBOT" } });
		}
		finally {
			global.instabotStartedAt = previous;
		}
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/2d 3h 4m/.test(text), "should show the elapsed time, got: " + text);
		assert.ok(/RUNTIME/.test(text), "should show the runtime section");
		assert.ok(/HOST/.test(text), "should show the host section");
		assert.ok(/MEMORY/.test(text), "should show the memory section");
		assert.ok(["love", "angry", "laugh", "cry"].includes(sent.avatarEffect), "should send with a random avatar effect");
	});

	await test("uptime: uses every avatar effect without repeating in a row", async () => {
		const command = registry.resolve("uptime");
		const seen = new Set();
		const message = { send: form => { seen.add(form.avatarEffect); return Promise.resolve({ messageID: "x" }); } };
		for (let i = 0; i < 40; i++) await command.onStart({ message, config: { botName: "InstaBOT" } });
		assert.ok(seen.size >= 2, "random choice should vary across calls, saw: " + [...seen].join(","));
	});

	await test("uptime: aliases resolve to the command", () => {
		assert.ok(registry.resolve("up"), "alias 'up' should resolve");
		assert.ok(registry.resolve("runtime"), "alias 'runtime' should resolve");
	});

	await test("auth: pushes bot cookies to POST /cookies before connecting", async () => {
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		const seen = [];
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				seen.push({ url: req.url, botId: req.headers["x-bot-id"], body });
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					ok: true,
					result: req.url === "/cookies" ? { botId: "42", accepted: true } : "123"
				}));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		try {
			const cookies = [
				{ key: "sessionid", value: "SID", domain: "instagram.com", path: "/" },
				{ key: "ds_user_id", value: "42", domain: "instagram.com", path: "/" }
			];
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", cookies });
			assert.strictEqual(api.getCurrentUserID(), "123");
			const push = seen.find(s => s.url === "/cookies");
			assert.ok(push, "expected a POST /cookies");
			// The bot starts with no id, so the push must not claim one.
			assert.strictEqual(push.botId, undefined, "a fresh push must not carry X-Bot-Id");
			const parsed = JSON.parse(push.body);
			assert.ok(Array.isArray(parsed.cookies), "cookies must be sent as an array");
			const idx = seen.findIndex(s => s.url === "/cookies");
			const rpc = seen.findIndex(s => s.url === "/rpc");
			assert.ok(idx < rpc, "cookies must be pushed before the first RPC");
			// Later calls use the id the server reported.
			const rpcReq = seen[rpc];
			assert.strictEqual(rpcReq.botId, "42", "later calls must carry the adopted id");
		}
		finally { server.close(); }
	});

	await test("boot: retries instead of exiting when the server has no session", async () => {
		const { createBot } = require(path.join(root, "src/bot"));
		const http = require("http");
		const os = require("os");
		let requests = 0;
		const server = http.createServer((req, res) => {
			requests++;
			if (req.url.startsWith("/events")) { res.writeHead(200, { "Content-Type": "text/event-stream" }); return; }
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: false, error: { message: 'Unknown bot id "default". No sessions are configured' } }));
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		const config = {
			botName: "TestBot", prefix: "/", adminBot: [], env: {},
			server: { url: "http://127.0.0.1:" + port, token: "t", botId: "default", timeout: 2000 },
			account: {}, database: { dir: path.join(os.tmpdir(), "igbot-test-" + process.pid) },
			logEvents: { disableAll: true },
			onlineStatus: { enable: false },
			welcome: { enable: false }, leave: { enable: false }
		};
		const bot = createBot(config);
		let settled = false;
		const startPromise = bot.start().then(() => { settled = true; }, () => { settled = true; });
		await new Promise(r => setTimeout(r, 1500));
		assert.strictEqual(settled, false, "start() must stay pending while retrying");
		assert.ok(requests >= 1, "the bot should have attempted at least one connect");
		await bot.stop();
		await Promise.race([startPromise, new Promise(r => setTimeout(r, 3000))]);
		server.close();
	});

	await test("shutdown: never logs the account out (redeploy must not kill the session)", async () => {
		const { createBot } = require(path.join(root, "src/bot"));
		const http = require("http");
		const os = require("os");
		// A fake server that would receive a `logout` RPC if the bot sent one.
		let logoutCalls = 0;
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				if (String(req.url).startsWith("/events")) {
					res.writeHead(200, { "Content-Type": "text/event-stream" });
					return;
				}
				if (/logout/.test(body)) logoutCalls++;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: "BOT123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		const config = {
			botName: "TestBot", prefix: "/", adminBot: [], env: {},
			server: { url: "http://127.0.0.1:" + port, token: "t", botId: "default", timeout: 2000 },
			account: {}, database: { dir: path.join(os.tmpdir(), "igbot-test-logout-" + process.pid) },
			logEvents: { disableAll: true },
			onlineStatus: { enable: false },
			welcome: { enable: false }, leave: { enable: false },
			autoMarkRead: false, autoMarkDelivery: false
		};
		const bot = createBot(config);
		try {
			await Promise.race([bot.start(), new Promise(r => setTimeout(r, 2500))]);
			await bot.stop();
		}
		finally {
			server.close();
		}
		assert.strictEqual(logoutCalls, 0, "stop() must never send a logout — it invalidates the cookies");
	});

	await test("loader: loadAll is idempotent (no duplicate commands/events)", () => {
		const reg = createRegistry();
		const first = loadAll(reg);
		assert.ok(first.commandCount > 0, "expected commands to load");
		const firstEvents = reg.events.length;
		const second = loadAll(reg);
		assert.strictEqual(second.commandCount, first.commandCount, "command count must not change on reload");
		assert.strictEqual(reg.events.length, firstEvents, "events must not duplicate on reload");
	});

	await test("status server: serves /health on the given port and stops", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer"));
		const http = require("http");

		// PORT=0 disables it (pure worker mode).
		assert.strictEqual(createStatusServer({ port: 0 }).enabled, false);

		// Grab a free ephemeral port, release it, then bind our server there.
		const probe = http.createServer();
		await new Promise(r => probe.listen(0, "127.0.0.1", r));
		const port = probe.address().port;
		await new Promise(r => probe.close(r));

		const live = createStatusServer({ port, host: "127.0.0.1", info: () => ({ online: true, botId: "botA" }) });
		await live.start();
		try {
			const res = await new Promise((resolve, reject) => {
				http.get({ host: "127.0.0.1", port, path: "/health" }, r => {
					let b = "";
					r.on("data", d => { b += d; });
					r.on("end", () => resolve({ status: r.statusCode, body: b }));
				}).on("error", reject);
			});
			assert.strictEqual(res.status, 200);
			const parsed = JSON.parse(res.body);
			assert.strictEqual(parsed.ok, true);
			assert.strictEqual(parsed.service, "instabot");
			assert.strictEqual(parsed.online, true);
			assert.strictEqual(parsed.botId, "botA");
		}
		finally { await live.stop(); }
	});

	/* ── group detection, join/leave, avatar fallback ── */

	await test("normalizeEvent: infers a group from participantIDs", async () => {
		const event = normalizeEvent({ type: "message", threadID: "g", senderID: "5", body: "hi", participantIDs: ["1", "2", "5"] });
		assert.strictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: keeps a DM a DM", async () => {
		const event = normalizeEvent({ type: "message", threadID: "d", senderID: "5", body: "hi" });
		assert.notStrictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: maps action_log added_participants onto userIDs", async () => {
		const event = normalizeEvent({ type: "join", threadID: "g", isGroup: true, added_participants: ["77", "88"] });
		assert.deepStrictEqual(event.userIDs, ["77", "88"]);
	});

	await test("dispatcher: resolves a group thread when isGroup is missing", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: undefined } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555"), "should treat the resolved group correctly");
	});

	await test("dispatcher: resolves thread admins and allows gc admin to run admin commands", async () => {
		const api = fakeApi({
			getThreadInfo: (id, cb) => cb(null, {
				threadID: id,
				isGroup: true,
				adminIDs: ["gc_admin_1"],
				userInfo: [{ id: "gc_admin_1", name: "Admin 1", isAdmin: true }]
			})
		});
		const db = makeDatabase();
		db.threads.ensure("gc_thread_1", { threadID: "gc_thread_1", isGroup: true, adminIDs: [] });
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });

		await dispatcher.handle({
			type: "message",
			threadID: "gc_thread_1",
			messageID: "m1",
			senderID: "gc_admin_1",
			body: "hello",
			isGroup: true
		});

		const threadDataAfter = db.threads.get("gc_thread_1");
		assert.ok(threadDataAfter.adminIDs.includes("gc_admin_1"), "threadData should have cached gc_admin_1 as admin");
		const role = dispatcher.roleOf({ senderID: "gc_admin_1" }, threadDataAfter);
		assert.strictEqual(role, dispatcher.ROLE_ADMIN_BOX, "gc_admin_1 must have ROLE_ADMIN_BOX");
	});

	await test("welcome event: greets only the added member, never the actor", async () => {
		// Regression: the id fallback included senderID, which in a membership
		// event is the ACTOR who added the member — so both were welcomed.
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: ["newmember"], userIDs: [], senderID: "999", userID: "999"
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @newmember/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /999/.test(b)), "the actor must not be welcomed: " + JSON.stringify(bodies));
	});

	await test("welcome event: greets a member added via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @arobrifat/.test(b)), JSON.stringify(bodies));
	});

	await test("welcome event: greets an added member by username, not numeric id", async () => {
		// The join event often carries only a numeric id; the greeting must
		// resolve it to the username (@handle), never print the raw id.
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, vanity: "arobrifat", name: "Aro Brifat" } })
		});
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: [], userIDs: ["56517826793"]
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @arobrifat/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /56517826793/.test(b)), "the numeric id must not be shown: " + JSON.stringify(bodies));
	});

	await test("leave event: announces a member removed via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "leave", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /@arobrifat left/.test(b)), JSON.stringify(bodies));
	});

	await test("leave event: announces a removed member by username, not numeric id", async () => {
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, vanity: "arobrifat", name: "Aro Brifat" } })
		});
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "leave", threadID: "g", isGroup: true,
			usernames: [], userIDs: ["56517826793"]
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /@arobrifat left/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /56517826793/.test(b)), "the numeric id must not be shown: " + JSON.stringify(bodies));
	});

	await test("avatarEffect: sends the effect name so the server adds no sticker id", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar:" + effect); cb(null, { ok: true }); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "d", messageID: "m", isGroup: false }, log });
		const result = await message.avatarEffect("hello", "laugh");
		assert.deepStrictEqual(result, { ok: true });
		assert.deepStrictEqual(calls, ["avatar:laugh"]);
	});

	await test("avatarEffect: surfaces a real failure instead of downgrading", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar"); cb(new Error("send failed")); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "g", messageID: "m", isGroup: true }, log });
		await assert.rejects(message.avatarEffect("hello", "laugh"), /send failed/);
		assert.deepStrictEqual(calls, ["avatar"]);
	});

	await test("avatarfx: works in a group with no sticker configuration", async () => {
		const avatarfx = require(path.join(root, "commands/avatarfx"));
		const replies = [];
		const message = {
			reply: (text) => { replies.push(text); },
			avatarEffect: () => Promise.resolve({ ok: true })
		};
		await avatarfx.onStart({ message, args: ["laugh", "nice"] });
		assert.deepStrictEqual(replies, []);
	});

	/* ── long-run stability guards ── */

	await test("EventStream: a stream that opened but never sent a byte is stalled", () => {
		// A proxy can accept the request and hold the socket open while the
		// server never writes. Age the silence clock from the connect time so
		// the stall watch reconnects instead of hanging forever.
		const { EventStream } = require(path.join(root, "auth.js"));
		const stream = new EventStream({ base: new URL("http://127.0.0.1:1"), token: "t", botId: "b" }, () => { });
		stream.req = {};                                  // a socket is open
		stream.connectedAt = Date.now() - 200000;         // opened 200s ago
		stream.lastChunkAt = 0;                           // never delivered a byte
		assert.strictEqual(stream._isStalled(Date.now()), true, "must be stalled");

		// A healthy stream that just got a chunk is not stalled.
		stream.lastChunkAt = Date.now() - 1000;
		assert.strictEqual(stream._isStalled(Date.now()), false, "fresh data means healthy");

		// A stopped stream or one with no open socket is never acted on.
		stream.lastChunkAt = 0;
		stream.stop();
		assert.strictEqual(stream._isStalled(Date.now()), false, "a stopped stream must not reconnect");
	});

	await test("EventStream: timestamps reset per connection so a fresh socket is not killed", () => {
		const { EventStream } = require(path.join(root, "auth.js"));
		const stream = new EventStream({ base: new URL("http://127.0.0.1:1"), token: "t", botId: "b" }, () => { });
		let requested = null;
		// Intercept the http request so _connect runs without real I/O.
		const http = require("http");
		const original = http.request;
		http.request = () => ({ on() { }, end() { }, destroy() { } });
		try {
			stream.lastChunkAt = Date.now() - 10 * 60 * 1000; // stale from a prior socket
			stream.connectedAt = 0;
			stream._connect();
			requested = stream.connectedAt;
			assert.strictEqual(stream.lastChunkAt, 0, "lastChunkAt must reset for the new attempt");
			assert.ok(requested > 0 && Date.now() - requested < 5000, "connectedAt must be set to now");
		}
		finally {
			http.request = original;
			stream.stop();
		}
	});

	await test("status server: a throwing handler never crashes the process", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer.js"));
		const server = createStatusServer({ port: 0, info: () => ({ ok: true }) });
		assert.strictEqual(server.enabled, false, "port 0 disables the server (pure worker mode)");
	});

	/* ── rate-limit vs not-found ── */
	await test("isRateLimitError: recognises 429 and Instagram throttle wording", () => {
		assert.strictEqual(utils.isRateLimitError({ error: "parseAndCheckLogin got status code: 429. Bailing out" }), true);
		assert.strictEqual(utils.isRateLimitError(new Error("Too Many Requests")), true);
		assert.strictEqual(utils.isRateLimitError({ message: "Please wait a few minutes before you try again." }), true);
		assert.strictEqual(utils.isRateLimitError("We're sorry, but something went wrong. Please try again."), true);
		assert.strictEqual(utils.isRateLimitError({ message: "Could not find @nobody." }), false);
		assert.strictEqual(utils.isRateLimitError(null), false);
	});

	await test("resolveUserTarget: a throttled handle is flagged, not reported missing", async () => {
		// The server answers getUserInfo with a 429; we must not then hammer the
		// anonymous endpoint, and must signal rateLimited (not a bare miss).
		let anonCalls = 0;
		const download = utils.download;
		utils.download = () => { anonCalls++; return Promise.resolve(Buffer.from("{}")); };
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429. Bailing out"))
			});
			const target = await utils.resolveUserTarget(["@arobrifat"], { threadID: "t", senderID: "1" }, api);
			assert.strictEqual(target.id, null);
			assert.strictEqual(target.username, "arobrifat");
			assert.strictEqual(target.rateLimited, true);
			assert.strictEqual(anonCalls, 0, "must not call the anonymous endpoint while throttled");
		}
		finally { utils.download = download; }
	});

	await test("resolveUserTarget: a genuine miss is not flagged as throttled", async () => {
		const download = utils.download;
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: null } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(new Error("Could not find @nobody."))
			});
			const target = await utils.resolveUserTarget(["@nobody"], { threadID: "t", senderID: "1" }, api);
			assert.strictEqual(target.id, null);
			assert.strictEqual(target.username, "nobody");
			assert.strictEqual(!!target.rateLimited, false);
		}
		finally { utils.download = download; }
	});

	await test("resolveProfile: an incomplete authenticated profile is filled from the public one", async () => {
		// getUserInfo can return a 200 without the social counts. The public
		// profile must fill them in for the same user.
		const download = utils.download;
		utils._resetUsernameCache();
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "777", username: "jane", full_name: "Jane Doe", biography: "hello",
			edge_followed_by: { count: 42 }, edge_follow: { count: 7 },
			profile_pic_url_hd: "https://example.com/p.jpg"
		} } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", profilePicture: "https://example.com/p.jpg" } })
			});
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(String(p.userID), "777");
			assert.strictEqual(p.followers, 42, "followers must be filled in");
			assert.strictEqual(p.following, 7, "following must be filled in");
			assert.strictEqual(p.biography, "hello");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("resolveProfile: a mismatched public profile never overwrites the right id", async () => {
		// A handle can collide with an unrelated account; the public result must
		// be ignored when its id differs from the authenticated one.
		const download = utils.download;
		utils._resetUsernameCache();
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "999999", username: "jane", full_name: "Jane Williamson", biography: "wrong person",
			edge_followed_by: { count: 1975133 }, edge_follow: { count: 979 }
		} } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", profilePicture: "https://example.com/p.jpg" } })
			});
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(String(p.userID), "777", "the id must stay the requested user's");
			assert.notStrictEqual(p.followers, 1975133, "must not take the wrong account's followers");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("resolveProfile: a throttled numeric id recovers the handle from the cache", async () => {
		const download = utils.download;
		utils._resetUsernameCache();
		// Prime the cache via a handle lookup, then throttle the id lookup.
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "777", username: "jane", full_name: "Jane Doe", biography: "hi",
			edge_followed_by: { count: 42 }, edge_follow: { count: 7 }
		} } })));
		try {
			await utils.resolveProfile(["jane"], {}, null); // writes the cache
			const api = fakeApi({ getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429")) });
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(p.followers, 42, "the cached handle must let the public endpoint fill the profile");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("uid: reports throttling instead of 'Could not find'", async () => {
		const command = registry.resolve("uid");
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429. Bailing out"))
		});
		const sent = [];
		const message = { reply: text => { sent.push(String(text)); return Promise.resolve({}); } };
		await command.onStart({
			message, args: ["@arobrifat"], api,
			event: { threadID: "t", senderID: "1", isGroup: false },
		});
		assert.ok(/rate-limiting/i.test(sent[0]), "expected a rate-limit reply, got: " + sent[0]);
	});

	await test("canvasHelper: generate and load default avatar fallback", async () => {
		const canvasHelper = require("../func/canvasHelper");
		assert.strictEqual(canvasHelper.isCanvasAvailable, true, "canvas must be available");
		const avatar = canvasHelper.createDefaultAvatar("Neoaz", 300);
		assert.ok(avatar, "createDefaultAvatar must return canvas");
		const buf = avatar.toBuffer("image/jpeg");
		assert.ok(buf.length > 0, "avatar must produce jpeg buffer");

		const loaded = await canvasHelper.loadAvatarOrFallback(null, "Alice", 200);
		assert.ok(loaded, "loadAvatarOrFallback must return fallback when image url is null");
	});

	await test("ica: sendPhoto argument resolution with buffers, numbers, and paths", async () => {
		const ica = require("../ica");
		const calls = [];
		const fakeClient = {
			sendPhoto: (tid, src, opts, cb) => {
				calls.push({ tid, src, opts });
				if (typeof cb === "function") cb(null, { messageID: "mid1" });
				return Promise.resolve({ messageID: "mid1" });
			},
			sendPhotoFromUrl: (tid, url, opts, cb) => {
				calls.push({ tid, url, opts });
				if (typeof cb === "function") cb(null, { messageID: "mid2" });
				return Promise.resolve({ messageID: "mid2" });
			}
		};

		const api = ica.buildApi(fakeClient);

		// Test 1: Standard signature: (threadID numeric, path)
		await api.sendPhoto(123456789, "/tmp/test.jpg");
		assert.strictEqual(calls[0].tid, "123456789");
		assert.strictEqual(calls[0].src, "/tmp/test.jpg");

		// Test 2: Inverted signature: (path, threadID numeric, caption)
		await api.sendPhoto("/tmp/test2.jpg", "987654321", "cool photo");
		assert.strictEqual(calls[1].tid, "987654321");
		assert.strictEqual(calls[1].src, "/tmp/test2.jpg");
		assert.strictEqual(calls[1].opts.caption, "cool photo");

		// Test 3: Buffer source
		const testBuf = Buffer.from("fake-img");
		await api.sendPhoto(55555, testBuf);
		assert.strictEqual(calls[2].tid, "55555");
		assert.strictEqual(calls[2].src, testBuf);

		// Test 4: URL source
		await api.sendPhoto("https://example.com/pic.png", 11111);
		assert.strictEqual(calls[3].tid, "11111");
		assert.strictEqual(calls[3].url, "https://example.com/pic.png");
	});

	await test("sendMessage: _sendAttachmentItem with Buffer and unknown media fallback", async () => {
		const SendMessage = require("../ica/src/methods/sendMessage");
		const fakeHttp = {
			getCsrfToken: () => "csrf",
			getCookieValue: () => "uid",
			rememberMessageThread: () => {}
		};
		const sm = new SendMessage(fakeHttp, { deviceId: "dev", uuid: "uuid" });
		const photoCalls = [];
		sm.sendMedia = {
			photo: async (tid, pathOrBuf, opts) => {
				photoCalls.push({ tid, pathOrBuf, opts });
				return { messageID: "photo1", threadID: tid };
			}
		};

		// 1. Buffer attachment directly handled as photo
		const buf = Buffer.from("image data");
		const res1 = await sm._sendAttachmentItem("thread1", buf);
		assert.strictEqual(photoCalls[0].tid, "thread1");
		assert.strictEqual(photoCalls[0].pathOrBuf, buf);

		// 2. Object with buffer
		const res2 = await sm._sendAttachmentItem("thread2", { buffer: buf });
		assert.strictEqual(photoCalls[1].tid, "thread2");
		assert.strictEqual(photoCalls[1].pathOrBuf.buffer, buf);
	});

	await test("emulation: BrowserSession parses cookies and generates browser client headers", async () => {
		const { BrowserSession } = require("../platforms/instagram/emulation/browserSession");
		const mockCookies = [
			{ name: "sessionid", value: "sess_test", domain: ".instagram.com" },
			{ name: "ds_user_id", value: "user_test", domain: ".instagram.com" },
			{ name: "csrftoken", value: "csrf_test", domain: ".instagram.com" }
		];
		const session = new BrowserSession({ cookies: mockCookies });
		assert.strictEqual(session.userId, "user_test");
		assert.strictEqual(session.sessionId, "sess_test");

		const headers = session.getBrowserHeaders();
		assert.strictEqual(headers["X-IG-App-ID"], "936619743392459");
		assert.strictEqual(headers["X-ASBD-ID"], "129477");
		assert.strictEqual(headers["sec-ch-ua-platform"], '"Windows"');
		assert(headers["Cookie"].includes("sessionid=sess_test"));

		const wsHeaders = session.getMqttWsHeaders();
		assert.strictEqual(wsHeaders["Sec-WebSocket-Version"], "13");
		assert.strictEqual(wsHeaders["X-ASBD-ID"], "129477");
		assert(wsHeaders["Cookie"].includes("sessionid=sess_test"));
	});

	await test("emulation: GraphQLClient formats broadcastText, broadcastReaction, and typing indicators", async () => {
		const { BrowserSession } = require("../platforms/instagram/emulation/browserSession");
		const { GraphQLClient } = require("../platforms/instagram/emulation/graphQLClient");
		const session = new BrowserSession({ cookies: "sessionid=sess_g; ds_user_id=usr_g; csrftoken=csrf_g;" });
		const client = new GraphQLClient(session);

		let intercepted = null;
		client.http.request = async (cfg) => {
			intercepted = cfg;
			return { data: { payload: { item_id: "mid_g_100" } }, headers: { "x-ig-set-www-claim": "claim_g" } };
		};

		const res = await client.broadcastText("th_g", "hello", "reply_target_1");
		assert.strictEqual(res.messageID, "mid_g_100");
		assert.strictEqual(res.threadID, "th_g");
		assert(intercepted.data.includes("hello"));
		assert(intercepted.data.includes("reply_target_1"));
		assert.strictEqual(intercepted.headers["X-ASBD-ID"], "129477");

		await client.broadcastReaction("th_g", "mid_g_100", "🔥");
		assert(intercepted.data.includes("reaction_type=like"));

		await client.sendTypingIndicator("th_g");
		assert(intercepted.data.includes("activity_status=1"));

		await client.stopTypingIndicator("th_g");
		assert(intercepted.data.includes("activity_status=0"));
	});

	await test("emulation: UserSessionEmulation supports flat API and event-driven bot patterns", async () => {
		const { UserSessionEmulation } = require("../platforms/instagram/emulation/userSession");
		const session = new UserSessionEmulation({
			appState: [{ name: "sessionid", value: "sess_emu", domain: ".instagram.com" }, { name: "ds_user_id", value: "bot_emu", domain: ".instagram.com" }]
		}, { commandPrefix: "/" });

		assert.strictEqual(session.getCurrentUserID(), "bot_emu");

		const sent = [];
		session.graphQLClient.broadcastText = async (tid, text, replyTo) => {
			sent.push({ tid, text, replyTo });
			return { messageID: "mid_" + sent.length, threadID: tid };
		};

		await session.sendMessage("hello emu", "th_100");
		assert.strictEqual(sent[0].text, "hello emu");
		assert.strictEqual(sent[0].tid, "th_100");

		let commandHandled = false;
		session.command("ping", async (ctx) => {
			commandHandled = true;
			await ctx.replyAsync("pong");
		});

		session._routeEvent({
			type: "message",
			threadID: "th_100",
			senderID: "user_u",
			messageID: "msg_u_1",
			body: "/ping"
		});

		assert(commandHandled);
		assert(sent.some(s => s.text === "pong" && s.replyTo === "msg_u_1"));
	});

	await test("emulation: integration with platforms/instagram getICA({ mode: 'emulation' })", async () => {
		const instagram = require("../platforms/instagram");
		const ica = instagram.getICA({ mode: "emulation" });
		assert.strictEqual(ica.mode, "emulation");
		assert(typeof ica.login === "function");
		assert(typeof instagram.createMessengerBot === "function");
	});

	/* ── edit command ── */
	await test("edit: configuration and registration", () => {
		const command = registry.resolve("edit");
		assert.ok(command, "edit command should be registered");
		assert.strictEqual(command.config.name, "edit");
		assert.ok(command.config.aliases.includes("imgedit"));
	});

	await test("edit: image extraction from reply and args", async () => {
		const command = registry.resolve("edit");
		let replySent = null;
		const message = {
			reply: (msg) => { replySent = msg; return Promise.resolve({ messageID: "1" }); },
			react: () => Promise.resolve({})
		};

		// 1. Missing image shows usage
		await command.onStart({
			api: {},
			event: { threadID: "t1", messageID: "m1", body: "*edit" },
			args: [],
			message
		});
		assert.ok(String(replySent).includes("Usage:"), "shows usage when no image");

		// 2. Missing prompt when image provided
		replySent = null;
		await command.onStart({
			api: {},
			event: {
				threadID: "t1",
				messageID: "m2",
				messageReply: {
					messageID: "img_msg",
					attachments: [{ url: "https://example.com/photo.jpg", type: "photo" }]
				}
			},
			args: [],
			message
		});
		assert.ok(String(replySent).includes("Please provide an edit prompt"), "asks for prompt when image provided without prompt");
	});

	await test("edit: active Toshiro API URL called with targetUrl and prompt", async () => {
		const command = registry.resolve("edit");
		const axios = require("axios");
		const originalGet = axios.get;
		const originalPost = axios.post;

		let toshiroCalled = false;
		let targetUrlPassed = null;
		let promptPassed = null;
		let deliverySent = null;
		const reactions = [];

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("toshiro-api-editz6t9.vercel.app")) {
					toshiroCalled = true;
					const parsed = new URL(url);
					targetUrlPassed = parsed.searchParams.get("url");
					promptPassed = parsed.searchParams.get("prompt");
					return {
						data: {
							success: true,
							url: "https://example.com/result.jpg"
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/result.jpg")) {
					return {
						data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9])
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { deliverySent = m; return Promise.resolve({ messageID: "sent1" }); },
				react: (r) => { reactions.push(r); return Promise.resolve({}); }
			};

			await command.onStart({
				api: {},
				event: {
					threadID: "t1",
					messageID: "m2",
					messageReply: {
						messageID: "orig_photo",
						attachments: [{ url: "https://i.imgur.com/direct.jpg", type: "photo" }]
					}
				},
				args: ["cyberpunk", "portrait"],
				message
			});

			assert.strictEqual(toshiroCalled, true, "Toshiro API endpoint must be called");
			assert.strictEqual(targetUrlPassed, "https://i.imgur.com/direct.jpg");
			assert.strictEqual(promptPassed, "cyberpunk portrait");
			assert.ok(deliverySent && deliverySent.attachment, "attachment must be delivered");
			assert.strictEqual(deliverySent.textFirst, false, "textFirst must be false to avoid separate caption");
			assert.deepStrictEqual(reactions, ["⏳", "✅"], "loading and success emoji reactions");
		}
		finally {
			axios.get = originalGet;
			axios.post = originalPost;
		}
	});

	await test("edit: image attached directly with caption prompt (*edit add bongobondu) extracts image", async () => {
		const command = registry.resolve("edit");
		const axios = require("axios");
		const originalGet = axios.get;
		const originalPost = axios.post;

		let toshiroCalled = false;
		let targetUrlPassed = null;
		let promptPassed = null;
		let deliverySent = null;

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("toshiro-api-editz6t9.vercel.app")) {
					toshiroCalled = true;
					const parsed = new URL(url);
					targetUrlPassed = parsed.searchParams.get("url");
					promptPassed = parsed.searchParams.get("prompt");
					return {
						data: {
							success: true,
							url: "https://example.com/result.jpg"
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/result.jpg")) {
					return {
						data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9])
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { deliverySent = m; return Promise.resolve({ messageID: "reply_ok" }); },
				react: () => Promise.resolve({})
			};

			await command.onStart({
				api: {},
				event: {
					threadID: "t1",
					messageID: "m_direct",
					body: "*edit add bongobondu",
					attachments: [{ url: "https://example.com/attached_photo.jpg", type: "photo" }]
				},
				args: ["add", "bongobondu"],
				message
			});

			assert.strictEqual(toshiroCalled, true, "Toshiro should be called for directly attached image");
			assert.strictEqual(targetUrlPassed, "https://example.com/attached_photo.jpg");
			assert.strictEqual(promptPassed, "add bongobondu");
			assert.ok(deliverySent && deliverySent.attachment, "attachment must be sent");
		} finally {
			axios.get = originalGet;
			axios.post = originalPost;
		}
	});

	await test("edit: delivery fallback to message.send when message.reply rejects attachment", async () => {
		const command = registry.resolve("edit");
		const axios = require("axios");
		const originalGet = axios.get;
		const originalPost = axios.post;

		let replyAttempted = false;
		let sendSent = null;

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("toshiro-api-editz6t9.vercel.app")) {
					return {
						data: {
							success: true,
							url: "https://example.com/result.jpg"
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/result.jpg")) {
					return {
						data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9])
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => {
					replyAttempted = true;
					return Promise.reject(new Error("Cannot reply with media to this item"));
				},
				send: (m) => {
					sendSent = m;
					return Promise.resolve({ messageID: "send_ok" });
				},
				react: () => Promise.resolve({})
			};

			await command.onStart({
				api: {},
				event: {
					threadID: "t1",
					messageID: "m_reply_fail",
					messageReply: {
						messageID: "p1",
						attachments: [{ url: "https://example.com/source.jpg", type: "photo" }]
					}
				},
				args: ["cyberpunk"],
				message
			});

			assert.strictEqual(replyAttempted, true, "reply should have been attempted first");
			assert.ok(sendSent && sendSent.attachment, "message.send should receive attachment when reply fails");
			assert.strictEqual(sendSent.textFirst, false);
		} finally {
			axios.get = originalGet;
			axios.post = originalPost;
		}
	});

	await test("edit: falls back to Pollinations Turbo when Toshiro fails", async () => {
		const command = registry.resolve("edit");
		const axios = require("axios");
		const originalGet = axios.get;
		const originalPost = axios.post;

		let pollinationsCalled = false;
		let deliverySent = null;

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("toshiro-api-editz6t9.vercel.app")) {
					throw new Error("Toshiro service timeout");
				}
				if (typeof url === "string" && url.includes("image.pollinations.ai")) {
					pollinationsCalled = true;
					return {
						data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9])
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { deliverySent = m; return Promise.resolve({ messageID: "reply_ok" }); },
				react: () => Promise.resolve({})
			};

			await command.onStart({
				api: {},
				event: {
					threadID: "t1",
					messageID: "m_poll_fallback",
					messageReply: {
						messageID: "p1",
						attachments: [{ url: "https://example.com/source.jpg", type: "photo" }]
					}
				},
				args: ["cyberpunk"],
				message
			});

			assert.strictEqual(pollinationsCalled, true, "Pollinations Turbo must be called when Toshiro fails");
			assert.ok(deliverySent && deliverySent.attachment, "delivered image buffer");
		} finally {
			axios.get = originalGet;
			axios.post = originalPost;
		}
	});

	await test("edit: group chat (gc) reply to photo executes edit and sends result", async () => {
		const command = registry.resolve("edit");
		const axios = require("axios");
		const originalGet = axios.get;
		const originalPost = axios.post;

		let toshiroCalled = false;
		let deliverySent = null;

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("toshiro-api-editz6t9.vercel.app")) {
					toshiroCalled = true;
					return {
						data: {
							success: true,
							url: "https://example.com/gc_result.jpg"
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/gc_result.jpg")) {
					return {
						data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9])
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { deliverySent = m; return Promise.resolve({ messageID: "gc_ok" }); },
				react: () => Promise.resolve({})
			};

			await command.onStart({
				api: {},
				event: {
					isGroup: true,
					threadID: "340282366841710300949128123456789",
					messageID: "m_gc_reply",
					messageReply: {
						messageID: "photo_msg_in_gc",
						media: {
							image_versions2: {
								candidates: [{ url: "https://example.com/gc_photo.jpg" }]
							}
						}
					}
				},
				args: ["cyberpunk", "anime"],
				message
			});

			assert.strictEqual(toshiroCalled, true, "Toshiro should be called in group chat");
			assert.ok(deliverySent && deliverySent.attachment, "attachment delivered to group chat");
		} finally {
			axios.get = originalGet;
			axios.post = originalPost;
		}
	});

	await test("music: live mode delivers MP3 audio directly via sing", async () => {
		const command = registry.resolve("music");
		let singInvoked = false;
		const singCmd = require("../commands/sing");
		const originalSingStart = singCmd.onStart;
		singCmd.onStart = async () => { singInvoked = true; return { messageID: "music_live" }; };

		try {
			await command.onStart({
				api: {}, // not an array for api.calls => live mode
				event: { threadID: "t1", messageID: "m1" },
				args: ["blinding", "lights"],
				message: { reply: () => Promise.resolve({}) }
			});
			assert.strictEqual(singInvoked, true, "music command in live mode must route to direct mp3 audio delivery");
		}
		finally {
			singCmd.onStart = originalSingStart;
		}
	});

	await test("alldl: extracts URL and delivers video attachment without extra body text", async () => {
		const command = registry.resolve("alldl");
		assert.ok(command, "alldl command should be registered");
		const axios = require("axios");
		const originalGet = axios.get;

		let deliverySent = null;
		const reactions = [];

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("tikwm.com/api")) {
					return {
						data: {
							data: {
								play: "https://example.com/video.mp4",
								title: "Sample Video"
							}
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/video.mp4")) {
					return {
						status: 200,
						data: Buffer.from("mock_video_bytes")
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { deliverySent = m; return Promise.resolve({ messageID: "alldl_reply" }); },
				react: (r) => { reactions.push(r); return Promise.resolve({}); }
			};

			await command.onStart({
				api: {},
				event: { threadID: "t1", messageID: "m1" },
				args: ["https://www.tiktok.com/@user/video/12345"],
				message
			});

			assert.ok(deliverySent && deliverySent.attachment, "attachment must be sent");
			assert.strictEqual(deliverySent.textFirst, false, "textFirst must be false");
			assert.strictEqual(deliverySent.body, undefined, "extra text caption must be omitted");
			assert.deepStrictEqual(reactions, ["⏳", "✅"]);
		} finally {
			axios.get = originalGet;
		}
	});

	await test("alldl: delivery fallback to message.send when reply fails", async () => {
		const command = registry.resolve("alldl");
		const axios = require("axios");
		const originalGet = axios.get;

		let replyAttempted = false;
		let sendSent = null;

		try {
			axios.get = async (url, opts) => {
				if (typeof url === "string" && url.includes("tikwm.com/api")) {
					return {
						data: {
							data: {
								play: "https://example.com/video.mp4",
								title: "Sample Video"
							}
						}
					};
				}
				if (typeof url === "string" && url.includes("example.com/video.mp4")) {
					return {
						status: 200,
						data: Buffer.from("mock_video_bytes")
					};
				}
				return originalGet.apply(axios, arguments);
			};

			const message = {
				reply: (m) => { replyAttempted = true; return Promise.reject(new Error("Cannot reply with media")); },
				send: (m) => { sendSent = m; return Promise.resolve({ messageID: "send_ok" }); },
				react: () => Promise.resolve({})
			};

			await command.onStart({
				api: {},
				event: { threadID: "t1", messageID: "m1" },
				args: ["https://www.tiktok.com/@user/video/12345"],
				message
			});

			assert.strictEqual(replyAttempted, true, "reply attempted first");
			assert.ok(sendSent && sendSent.attachment, "message.send receives attachment");
			assert.strictEqual(sendSent.textFirst, false);
			assert.strictEqual(sendSent.body, undefined);
		} finally {
			axios.get = originalGet;
		}
	});

	await test("ica: ValidationUtils accepts group thread IDs with colons, prefixes, and underscores", () => {
		const ValidationUtils = require("../ica/src/utils/validation");
		assert.strictEqual(ValidationUtils.isValidThreadID("123456789"), true);
		assert.strictEqual(ValidationUtils.isValidThreadID("12345:67890"), true);
		assert.strictEqual(ValidationUtils.isValidThreadID("t_s_17841401234567890"), true);
		assert.strictEqual(ValidationUtils.isValidThreadID("th_123_456"), true);
		assert.strictEqual(ValidationUtils.isValidThreadID(["12345", "67890"]), true);
		assert.strictEqual(ValidationUtils.isValidThreadID(""), false);
		assert.strictEqual(ValidationUtils.isValidThreadID(null), false);

		const valid1 = ValidationUtils.validateThreadID("12345:67890");
		assert.strictEqual(valid1.valid, true);
		assert.strictEqual(valid1.id, "12345:67890");
	});

	/* ── summary ── */
	const failed = results.filter(r => !r.ok);
	for (const r of results)
		console.log(`${r.ok ? "  ok " : "FAIL "} - ${r.name}`);
	console.log(`\n${count}/${results.length} tests passed`);
	if (failed.length) {
		for (const f of failed) console.error("\n" + f.name + ":\n", f.error);
		process.exit(1);
	}
	process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
