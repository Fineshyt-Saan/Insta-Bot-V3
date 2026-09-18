"use strict";

/**
 * Configuration + Instagram cookie loading.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// IG_CONFIG_PATH lets tests (and unusual deployments) point at a scratch config
// instead of the repo's config.json — otherwise a command that calls saveConfig
// (e.g. `prefix`) would overwrite the operator's real file during a test run.
// Resolved per call so the override can be set at any time.
function configPathFor() {
	return process.env.IG_CONFIG_PATH
		? path.resolve(process.env.IG_CONFIG_PATH)
		: path.join(ROOT, "config.json");
}
function accountPathFor() {
	return process.env.IG_ACCOUNT_PATH
		? path.resolve(process.env.IG_ACCOUNT_PATH)
		: path.join(ROOT, "account.txt");
}
const accountPath = accountPathFor();

function readJSON(file) {
	const raw = fs.readFileSync(file, "utf8");
	try {
		return JSON.parse(raw);
	}
	catch (error) {
		throw new Error(`Invalid JSON in ${path.basename(file)}: ${error.message}`);
	}
}

function loadConfig() {
	if (!fs.existsSync(configPathFor()))
		throw new Error("config.json not found");
	const config = readJSON(configPathFor());

	config.botName = config.botName || "InstaBOT";
	config.prefix = typeof config.prefix === "string" ? config.prefix : "*";
	config.language = config.language || "en";
	// Bot admins are the accounts allowed to run admin-only commands. They are
	// per-deployment, never baked into the repo: set them in config.json, or in
	// the environment as a comma-separated IG_ADMIN_BOT (it wins).
	config.adminBot = Array.isArray(config.adminBot) ? config.adminBot.map(String).filter(Boolean) : [];
	if (process.env.IG_ADMIN_BOT && process.env.IG_ADMIN_BOT.trim()) {
		config.adminBot = process.env.IG_ADMIN_BOT.split(",").map(s => s.trim()).filter(Boolean);
	}
	config.devUsers = Array.isArray(config.devUsers) ? config.devUsers.map(String).filter(Boolean) : [];
	if (config.devUsers.length === 0) {
		try {
			const def = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "default.json"), "utf8"));
			config.devUsers = [
				...(Array.isArray(def.devUsers) ? def.devUsers : []),
				...(Array.isArray(def.adminBot) ? def.adminBot : [])
			].map(String).filter(Boolean);
		} catch (_) {}
	}
	config.whiteList = config.whiteList || { enable: false, userIDs: [], threadIDs: [] };
	config.whiteList.userIDs = (config.whiteList.userIDs || []).map(String);
	config.whiteList.threadIDs = (config.whiteList.threadIDs || []).map(String);
	config.onlineStatus = config.onlineStatus || {};
	config.database = config.database || {};
	config.database.dir = config.database.dir || "data";

	// These are read unconditionally by the dispatcher, so guarantee their shape
	// even when an operator trims them out of config.json.
	config.hideNotiMessage = config.hideNotiMessage || {};
	config.adminOnly = config.adminOnly || {};
	config.adminOnly.enable = config.adminOnly.enable === true || config.defaultOff === true;
	config.defaultOff = config.adminOnly.enable;
	config.ADMIN_ONLY_ENABLE = config.adminOnly.enable;
	config.adminOnly.ignoreCommands = Array.isArray(config.adminOnly.ignoreCommands)
		? config.adminOnly.ignoreCommands.map(String)
		: [];
	config.cooldown = config.cooldown || {};
	config.cooldown.default = Number(config.cooldown.default) || 0;
	config.logEvents = config.logEvents || {};
	config.antiInbox = config.antiInbox === true;
	config.noPrefix = config.noPrefix === true;

	// Optional secrets/endpoints for custom commands.
	//
	// Only the namespaced INSTABOT_* variables are read: hosts like Render set a
	// bare `URL` (the service's own public URL) and `PORT`, and picking those up
	// as an API endpoint silently broke commands (e.g. `sing` hitting the bot's
	// own host and getting a 404).
	config.env = config.env || {};
	config.env.token = process.env.INSTABOT_TOKEN || config.env.token || "";
	config.env.url = process.env.INSTABOT_URL || config.env.url || "";

	// Music: blank apiUrl means "use Instagram's own catalogue". NEVER fall back
	// to env.url — that is not a music server, and a host like Render/Railway
	// that sets URL/INSTABOT_URL for its own service would make `sing` query the
	// bot's own host and get a 404.
	config.music = config.music || {};
	config.music.enable = config.music.enable !== false;
	config.music.apiUrl = config.music.apiUrl || "";
	config.music.apiToken = config.music.apiToken || "";

	// Private ig-chat-api server.
	//
	// The environment WINS over config.json. This is deliberate: a forked repo
	// can carry a committed `server.url` from whoever published it, and a
	// deployment must always be able to point at its own server. Before, the
	// file value took priority, so everyone who forked and set IG_API_SERVER in
	// their host dashboard still connected to the original author's server (and
	// therefore to that author's Instagram account).
	config.server = config.server || {};
	config.server.url = process.env.IG_API_SERVER || config.server.url || "";
	config.server.token = process.env.IG_API_TOKEN || config.server.token || "";
	// There is deliberately no bot id to configure. The server identifies each
	// session by the account's own Instagram id, and the bot learns its id from
	// the server's /cookies reply (see auth.js). Any legacy botId in config.json
	// / IG_BOT_ID is ignored.
	delete config.server.botId;
	config.server.timeout = Number(config.server.timeout) || 60000;

	// Welcome / leave announcements for group threads (disabled by default, can be enabled via config.json)
	config.welcome = config.welcome || {};
	if (config.welcome.enable == null) config.welcome.enable = false;
	if (!config.welcome.message) config.welcome.message = "Welcome %1 to %2! 👋";
	if (!Array.isArray(config.welcome.threadIDs)) config.welcome.threadIDs = [];

	config.leave = config.leave || {};
	if (config.leave.enable == null) config.leave.enable = false;
	if (!config.leave.message) config.leave.message = "%1 left %2. 👋";
	if (!Array.isArray(config.leave.threadIDs)) config.leave.threadIDs = [];

	return config;
}

function saveConfig(config) {
	fs.writeFileSync(configPathFor(), JSON.stringify(config, null, "\t") + "\n");
}

function isNetScapeCookie(text) {
	return /(.+)\t(1|TRUE|true)\t([\w/.-]*)\t(1|TRUE|true)\t\d+\t([\w-]+)\t(.+)/i.test(text);
}

function netScapeToCookies(text) {
	const cookies = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		// `#HttpOnly_` lines are real cookies, not comments; only skip the rest.
		if (!line || (line.startsWith("#") && !/^#HttpOnly_/i.test(line))) continue;
		const fields = line.replace(/^#HttpOnly_/i, "").split("\t").map(f => f.trim()).filter(Boolean);
		if (fields.length < 7) continue;
		cookies.push({
			key: fields[5],
			value: fields[6],
			domain: fields[0].replace(/^\./, ""),
			path: fields[2] || "/"
		});
	}
	return cookies;
}

function cookieHeaderToCookies(text) {
	return String(text)
		.replace(/^cookie\s*:/i, "")
		.replace(/\r?\n/g, " ")
		.split(";")
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => {
			const index = part.indexOf("=");
			if (index < 1) return null;
			return {
				key: part.slice(0, index).trim(),
				value: part.slice(index + 1).trim(),
				domain: "instagram.com",
				path: "/"
			};
		})
		.filter(Boolean);
}

function normalizeCookies(list) {
	return (Array.isArray(list) ? list : [])
		.map(item => {
			if (!item || typeof item !== "object") return null;
			const key = item.key || item.name;
			return key ? { key, value: item.value, domain: item.domain || "instagram.com", path: item.path || "/" } : null;
		})
		.filter(item => item && item.key && item.value !== undefined);
}

function parseCookiesFromText(text) {
	let cookies = [];
	if (text.startsWith("[") || text.startsWith("{")) {
		let parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) {
			const obj = parsed.cookies || parsed.appState || parsed;
			parsed = Array.isArray(obj) ? obj : Object.keys(obj).map(key => ({ key, value: obj[key] }));
		}
		cookies = normalizeCookies(parsed);
	}
	else if (isNetScapeCookie(text)) {
		cookies = netScapeToCookies(text);
	}
	else {
		cookies = cookieHeaderToCookies(text);
	}
	return cookies;
}

function checkCredentialsStatus() {
	const cfg = loadConfig();
	if (cfg.server && cfg.server.url && cfg.server.token) {
		return { mode: "server", ok: true, source: process.env.IG_API_SERVER ? "environment (IG_API_SERVER)" : "config.json (server.url)", url: cfg.server.url };
	}

	let text = "";
	let source = "";
	if (process.env.IG_COOKIES && process.env.IG_COOKIES.trim()) {
		text = process.env.IG_COOKIES.trim();
		source = "environment (IG_COOKIES)";
	} else if (process.env.ACCOUNT_TXT && process.env.ACCOUNT_TXT.trim()) {
		text = process.env.ACCOUNT_TXT.trim();
		source = "environment (ACCOUNT_TXT)";
	} else if (process.env.FB_STATE && process.env.FB_STATE.trim()) {
		text = process.env.FB_STATE.trim();
		source = "environment (FB_STATE)";
	} else if (fs.existsSync(accountPathFor())) {
		text = fs.readFileSync(accountPathFor(), "utf8").trim();
		source = "file (account.txt)";
	}

	if (!text) {
		return { mode: "direct", ok: false, source: source || "none", reason: "No Instagram cookies found in account.txt or environment variables" };
	}

	if (text.includes("YOUR_SESSION_ID") || text.includes("YOUR_USER_ID")) {
		return { mode: "direct", ok: false, source, reason: "account.txt contains unconfigured placeholder values (YOUR_SESSION_ID)" };
	}

	try {
		const cookies = parseCookiesFromText(text);
		const has = key => cookies.some(cookie => cookie.key === key);
		if (!has("sessionid") || !(has("ds_user_id") || has("userid"))) {
			const found = cookies.map(c => c.key).join(", ") || "none";
			return { mode: "direct", ok: false, source, reason: `Missing required cookies (sessionid, ds_user_id). Found: [${found}]` };
		}
		const uidCookie = cookies.find(c => c.key === "ds_user_id" || c.key === "userid");
		return { mode: "direct", ok: true, source, cookiesCount: cookies.length, userID: uidCookie ? uidCookie.value : "unknown" };
	}
	catch (error) {
		return { mode: "direct", ok: false, source, reason: error.message };
	}
}

/**
 * Parse account.txt or environment variables into an Instagram cookie list.
 * Accepts: JSON array, JSON object, cookie header string, Netscape file.
 */
function loadAccount() {
	let text = "";
	if (process.env.IG_COOKIES && process.env.IG_COOKIES.trim()) {
		text = process.env.IG_COOKIES.trim();
	} else if (process.env.ACCOUNT_TXT && process.env.ACCOUNT_TXT.trim()) {
		text = process.env.ACCOUNT_TXT.trim();
	} else if (process.env.FB_STATE && process.env.FB_STATE.trim()) {
		text = process.env.FB_STATE.trim();
	} else if (fs.existsSync(accountPathFor())) {
		text = fs.readFileSync(accountPathFor(), "utf8").trim();
	}

	if (!text) {
		throw new Error(
			"account.txt not found or empty. Copy account.example.txt to account.txt and paste your Instagram cookies (or set IG_COOKIES / ACCOUNT_TXT environment secrets). It is git-ignored, so your cookies are never committed."
		);
	}

	if (text.includes("YOUR_SESSION_ID") || text.includes("YOUR_USER_ID")) {
		throw new Error(
			"account.txt contains unconfigured placeholder values. Replace YOUR_SESSION_ID and YOUR_USER_ID with your real Instagram cookies."
		);
	}

	let cookies = parseCookiesFromText(text);

	const has = key => cookies.some(cookie => cookie.key === key);
	if (!has("sessionid") || !(has("ds_user_id") || has("userid")))
		throw new Error("account.txt must contain Instagram `sessionid` and `ds_user_id` cookies");

	return cookies;
}

module.exports = {
	ROOT,
	get configPath() { return configPathFor(); },
	get accountPath() { return accountPathFor(); },
	loadConfig,
	saveConfig,
	loadAccount,
	checkCredentialsStatus,
	parseCookiesFromText,
	normalizeCookies,
	netScapeToCookies,
	cookieHeaderToCookies,
	isNetScapeCookie
};
