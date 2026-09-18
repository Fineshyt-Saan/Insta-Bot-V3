"use strict";

/**
 * event.js — Manage and control event scripts live (𝐒𝐀𝐀𝐍 𝐄𝐗𝐇𝐀𝐔𝐒𝐓𝐄𝐃 / GoatBot V2 standard)
 *
 * Authors: 𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍
 */

const fs = require("fs");
const path = require("path");
const { loadDirectory, validate } = require("../src/commandLoader");

const ROOT = path.resolve(__dirname, "..");
const EVENTS_DIR = path.join(ROOT, "events");

function resolveEventFile(name) {
	const clean = String(name || "").trim();
	if (!clean || /[^\w.-]/.test(clean)) return null;
	const filename = clean.endsWith(".js") ? clean : clean + ".js";
	const candidate = path.join(EVENTS_DIR, filename);
	return candidate.startsWith(EVENTS_DIR) && fs.existsSync(candidate) ? candidate : null;
}

function loadEventInto(registry, file) {
	delete require.cache[require.resolve(file)];
	const script = require(file);
	validate(script, path.basename(file), "event");
	script.location = path.resolve(file);
	if (registry && typeof registry.unregisterEvent === "function") {
		registry.unregisterEvent(script.config.name);
	}
	if (registry && Array.isArray(registry.events)) {
		registry.events.push(script);
	}
	if (global.GoatBot && global.GoatBot.events instanceof Map) {
		global.GoatBot.events.set(String(script.config.name).toLowerCase(), script);
	}
	return { name: script.config.name, location: script.location };
}

function normalizeUrl(url) {
	let u = String(url || "").trim();
	if (!/^https?:\/\//i.test(u)) return null;
	const gh = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
	if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
	const bin = u.match(/^https?:\/\/pastebin\.com\/(?!raw\/)(\w+)/i);
	if (bin) return `https://pastebin.com/raw/${bin[1]}`;
	return u;
}

function fileNameFromUrl(url) {
	try {
		const pathname = new URL(url).pathname;
		const name = path.basename(pathname);
		return /^[\w.-]+\.js$/i.test(name) ? name : null;
	} catch (_) {
		return null;
	}
}

function isCodeLike(text) {
	const t = String(text || "");
	return /module\.exports|exports\.config|function\s*\(/.test(t) && /onEvent|onStart|run/.test(t);
}

async function fetchText(url, timeout = 30000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; InstaBOT)",
				"Accept": "text/plain, application/javascript, */*"
			},
			signal: controller.signal,
			redirect: "follow"
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.text();
	} finally {
		clearTimeout(timer);
	}
}

module.exports = {
	config: {
		name: "event",
		aliases: ["events", "eventcmd"],
		version: "2.0.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Load, unload, reload, list, toggle or install event handlers" },
		usage: { en: "{p}event <load|loadall|unload|reload|list|install|on|off> [name]" }
	},

	onStart: async function ({ message, args, config, registry, event, role, threadData, threadsData, database }) {
		const uid = String(event.senderID || event.userID || "").trim();
		const threadID = String(event.threadId || event.threadID || "");

		const isBotAdmin = (role != null && role >= 2) || (
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.devUsers) && config.devUsers.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid))
		);

		// Non-admins cannot use event command by default, do not send any output (Floppa standard)
		if (!isBotAdmin) {
			return;
		}

		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || (database && database.threads && typeof database.threads.get === "function" ? database.threads.get(threadID) : null) || {};
		if (!tData.settings) tData.settings = {};

		function saveThreadData() {
			if (threadsData && typeof threadsData.set === "function") threadsData.set(threadID, tData);
			if (database && typeof database.setThreadData === "function") database.setThreadData(threadID, tData);
			if (database && database.threads && typeof database.threads.set === "function") database.threads.set(threadID, tData);
			if (database && database.threads && typeof database.threads.update === "function") database.threads.update(threadID, tData);
			if (database && typeof database.save === "function") database.save();
			if (database && typeof database.flush === "function") database.flush();
		}

		const action = (args.shift() || "list").toLowerCase();
		const p = (config && (config.prefix || config.PREFIX)) || "*";

		// Toggle events for this chat
		if (action === "off" || action === "disable") {
			tData.eventsOff = true;
			tData.settings.eventsOff = true;
			saveThreadData();
			return message.reply("🔇 Event notifications (welcome/leave) have been DISABLED for this chat.");
		}

		if (action === "on" || action === "enable") {
			tData.eventsOff = false;
			tData.settings.eventsOff = false;
			saveThreadData();
			return message.reply("🔔 Event notifications (welcome/leave) have been ENABLED for this chat.");
		}

		if (action === "list") {
			const events = (registry && Array.isArray(registry.events)
				? registry.events.map(s => s.config?.name || s.name || "unnamed")
				: (global.GoatBot && global.GoatBot.events instanceof Map ? Array.from(global.GoatBot.events.keys()) : [])
			).filter(Boolean);
			const evState = !(tData.eventsOff === true || tData.settings.eventsOff === true);
			return message.reply(
				`📦 Loaded events (${events.length}):\n${events.join(", ") || "—"}\n\n` +
				`🔔 Chat Events: ${evState ? "ENABLED ✅" : "DISABLED ❌"}`
			);
		}

		if (action === "loadall") {
			const ok = [];
			const fail = [];
			for (const entry of loadDirectory("events", "event")) {
				try {
					loadEventInto(registry, entry.script.location);
					ok.push(entry.script.config.name);
				} catch (error) {
					fail.push(`${entry.script.config.name}: ${String(error.message || error)}`);
				}
			}
			return message.reply(
				`✅ Reloaded ${ok.length} event script(s).\n` + (fail.length ? `❌ Failed:\n${fail.join("\n")}` : "")
			);
		}

		if (action === "unload") {
			const name = args[0];
			if (!name) return message.reply(`⚠️ Usage: ${p}event unload <name>`);
			let removed = false;
			if (registry && typeof registry.unregisterEvent === "function") {
				removed = registry.unregisterEvent(name);
			}
			if (global.GoatBot && global.GoatBot.events instanceof Map) {
				removed = global.GoatBot.events.delete(name.toLowerCase()) || removed;
			}
			if (!removed) return message.reply(`❌ No loaded event named "${name}".`);
			return message.reply(`✅ Unloaded event "${name}" live.`);
		}

		if (action === "load" || action === "reload") {
			const name = args[0];
			if (!name) return message.reply(`⚠️ Usage: ${p}event ${action} <name>`);
			const file = resolveEventFile(name);
			if (!file) {
				return message.reply(`❌ Event file not found for "${name}" in events/.`);
			}
			try {
				const loaded = loadEventInto(registry, file);
				return message.reply(`✅ Reloaded event "${loaded.name}" live.`);
			} catch (error) {
				return message.reply(`❌ Failed to load "${name}": ${String(error.message || error)}`);
			}
		}

		if (action === "install" || action === "add") {
			const reply = event.messageReply;
			let fileName = args.find(a => /\.js$/i.test(a) && !/^https?:\/\//i.test(a)) || null;
			let code = null;
			const urlArg = args.find(a => /^https?:\/\//i.test(a));

			if (reply && reply.body && isCodeLike(reply.body)) {
				code = reply.body;
			} else if (urlArg) {
				const url = normalizeUrl(urlArg);
				if (!url) return message.reply("❌ Give a valid http(s) URL.");
				if (!fileName) fileName = fileNameFromUrl(url);
				try {
					code = await fetchText(url);
				} catch (error) {
					return message.reply(`❌ Could not download the event: ${String(error.message || error)}`);
				}
			}

			if (!code) {
				return message.reply(`⚠️ Usage:\n${p}event install <url> [name.js]\n${p}event install <name.js> (replying to code)`);
			}

			if (!fileName) fileName = "custom_event_" + Date.now().toString(36) + ".js";
			if (!fileName.endsWith(".js")) fileName += ".js";
			const dest = path.join(EVENTS_DIR, fileName);

			try {
				fs.mkdirSync(EVENTS_DIR, { recursive: true });
				fs.writeFileSync(dest, code, "utf8");
				const loaded = loadEventInto(registry, dest);
				return message.reply(`✅ Installed event "${loaded.name}" to events/${fileName} and loaded live.`);
			} catch (error) {
				return message.reply(`❌ Failed to install event: ${String(error.message || error)}`);
			}
		}

		return message.reply(`❌ Unknown action "${action}". Use list, load, unload, reload, loadall, on, off, or install.`);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
