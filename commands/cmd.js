"use strict";

const fs = require("fs");
const path = require("path");
const { loadDirectory, validate } = require("../src/commandLoader");

const ROOT = path.resolve(__dirname, "..");
const COMMANDS_DIR = path.join(ROOT, "commands");
const EVENTS_DIR = path.join(ROOT, "events");

const COMMAND_TEMPLATE = `module.exports = {
	config: {
		name: "mycommand",
		aliases: [],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "custom",
		cooldown: 3,
		role: 0,
		description: { en: "Describe what this command does" },
		usage: { en: "{p}mycommand <args>" }
	},

	onStart: async function ({ message, args, event, config, api, usersData, threadsData }) {
		return message.reply("Hello from my custom command!");
	}
};
`;

const EVENT_TEMPLATE = `module.exports = {
	config: {
		name: "myevent",
		eventType: "message",
		author: "your name",
		category: "custom",
		description: { en: "Describe what this event does" }
	},

	onEvent: async function ({ api, event, message, config }) {
	}
};
`;

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
	}
	catch (_) {
		return null;
	}
}

function isCodeLike(text) {
	const t = String(text || "");
	return /module\.exports|exports\.config|function\s*\(/.test(t) && /onStart|onEvent/.test(t);
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
	}
	finally {
		clearTimeout(timer);
	}
}

function resolveFile(name, isEvent) {
	const dir = isEvent ? EVENTS_DIR : COMMANDS_DIR;
	const clean = String(name || "").trim();
	if (!clean || /[^\w.-]/.test(clean)) return null;
	const filename = clean.endsWith(".js") ? clean : clean + ".js";
	const candidate = path.join(dir, filename);
	return candidate.startsWith(dir) && fs.existsSync(candidate) ? candidate : null;
}

function targetDir(isEvent) {
	return isEvent ? EVENTS_DIR : COMMANDS_DIR;
}

function installFile(name, code, isEvent) {
	const clean = String(name || "").trim();
	if (!clean || /[^\w.-]/.test(clean) || !clean.endsWith(".js"))
		return { error: "Give a valid file name ending in .js (letters, digits, _ - only)." };
	const file = path.join(targetDir(isEvent), clean);
	if (!file.startsWith(targetDir(isEvent))) return { error: "Invalid file name." };
	fs.mkdirSync(targetDir(isEvent), { recursive: true });
	fs.writeFileSync(file, String(code), "utf8");
	return { file };
}

function loadInto(registry, file, isEvent) {
	delete require.cache[require.resolve(file)];
	const script = require(file);
	validate(script, path.basename(file), isEvent ? "event" : "command");
	script.location = path.resolve(file);
	if (isEvent) {
		registry.unregisterEvent(script.config.name);
		registry.events.push(script);
		return { name: script.config.name, location: script.location };
	}
	registry.unregisterCommand(script.config.name);
	const error = registry.registerCommand({ file: path.basename(file), script, commandName: script.config.name });
	if (error) throw new Error(error);
	return { name: script.config.name, aliases: script.config.aliases || [], location: script.location };
}

function extractCodeFromBody(body, args) {
	const text = String(body || "");
	const idx = text.search(/install\b/i);
	const after = (idx >= 0 ? text.slice(idx + "install".length) : args.join(" ")).trim();

	const tokens = after.split(/\s+/).filter(Boolean);
	const urlToken = tokens.find(t => /^https?:\/\//i.test(t)) || null;
	const nameToken = tokens.find(t => /\.js$/i.test(t) && !/^https?:\/\//i.test(t)) || null;

	// A URL anywhere in the arguments means "download and install", no matter
	// whether the file name comes before or after it. Never fall through to
	// treating the URL itself as inline code.
	if (urlToken) return { code: null, url: urlToken, fileName: nameToken };

	const named = after.match(/^(\S+\.js)\s+([\s\S]+)$/);
	if (named && isCodeLike(named[2])) return { code: named[2], fileName: named[1] };
	if (isCodeLike(after)) return { code: after, fileName: null };
	if (named) return { code: named[2], fileName: named[1] };
	return { code: null, fileName: null };
}

module.exports = {
	config: {
		name: "cmd",
		aliases: ["command"],
		author: "Neoaz 🐊",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Install, uninstall, load, unload or list commands and events" },
		usage: { en: "{p}cmd <load|loadall|unload|uninstall|reload|remove|list|install> [args]\n{p}cmd install <url> [name.js]  or  {p}cmd install <name.js> <url>" }
	},

	onStart: async function ({ message, args, config, registry, event, setReactionHandler, role }) {
		const uid = String(event.senderID || event.userID || "").trim();
		const isBotAdmin = (role != null && role >= 2) || (
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.devUsers) && config.devUsers.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid))
		);
		if (!isBotAdmin) return;

		const action = (args.shift() || "list").toLowerCase();
		const isEventFlag = args.includes("--event");
		const rest = args.filter(a => a !== "--event");

		if (action === "list") {
			const commands = [...registry.commands.keys()].sort();
			const events = registry.events.map(script => script.config.name);
			return message.reply(
				`📦 Loaded commands (${commands.length}):\n${commands.join(", ")}\n\n` +
				`📦 Loaded events (${events.length}):\n${events.join(", ") || "—"}`
			);
		}

		if (action === "template") {
			return message.reply((rest[0] || "command").toLowerCase() === "event" ? EVENT_TEMPLATE : COMMAND_TEMPLATE);
		}

		if (action === "loadall") {
			const ok = [];
			const fail = [];
			for (const dir of ["commands", "events"]) {
				const isEvent = dir.includes("event");
				for (const entry of loadDirectory(dir, isEvent ? "event" : "command")) {
					try {
						loadInto(registry, entry.script.location, isEvent);
						ok.push(entry.script.config.name);
					}
					catch (error) {
						fail.push(`${entry.script.config.name}: ${String(error.message || error)}`);
					}
				}
			}
			return message.reply(
				`✅ Reloaded ${ok.length} script(s).\n` + (fail.length ? `❌ Failed:\n${fail.join("\n")}` : "")
			);
		}

		if (action === "install" || action === "add") {
			const reply = event.messageReply;
			let fileName = rest.find(a => /\.js$/i.test(a) && !/^https?:\/\//i.test(a)) || null;
			let code = null;
			let source = null;

			const textish = extractCodeFromBody(event.body, rest);
			if (textish.fileName) fileName = fileName || textish.fileName;

			const urlArg = textish.url || rest.find(a => /^https?:\/\//i.test(a));

			if (textish.code) {
				code = textish.code;
				source = "code";
			}
			else if (reply && reply.body && isCodeLike(reply.body)) {
				code = reply.body;
				source = "reply";
			}
			else if (reply && Array.isArray(reply.attachments) && reply.attachments.some(a => a && (a.url || a.largePreviewUrl))) {
				const att = reply.attachments.find(a => a && (a.url || a.largePreviewUrl));
				const url = normalizeUrl(att.url || att.largePreviewUrl);
				if (url) {
					try {
						code = await fetchText(url);
						source = "reply-attachment";
					}
					catch (error) {
						return message.reply(`❌ Could not download the file: ${String(error.message || error)}`);
					}
				}
			}
			else if (urlArg) {
				const url = normalizeUrl(urlArg);
				if (!url) return message.reply("❌ Give a valid http(s) URL.");
				if (!fileName) fileName = fileNameFromUrl(url);
				try {
					code = await fetchText(url);
					source = url;
				}
				catch (error) {
					return message.reply(`❌ Could not download the file: ${String(error.message || error)}`);
				}
			}

			if (!code) {
				return message.reply(
					"⚠️ Nothing to install. Give a URL, reply to a message containing the code, " +
					"or pass the code directly:\n" +
					`${config.prefix}cmd install <url>\n` +
					`${config.prefix}cmd install <url> <name.js>\n` +
					`${config.prefix}cmd install <name.js> <url>\n` +
					`${config.prefix}cmd install <name.js> <code>\n` +
					`${config.prefix}cmd install <code>`
				);
			}

			if (!fileName) fileName = "custom_" + Date.now().toString(36) + ".js";
			if (!fileName.endsWith(".js")) fileName += ".js";
			if (!/^[\w.-]+\.js$/.test(fileName)) return message.reply("❌ Invalid file name.");
			if (!isCodeLike(code)) {
				return message.reply("❌ The downloaded file does not look like a valid InstaBOT command or event.");
			}

			const looksLikeEvent = /onEvent\s*[:(]/.test(code) && !/onStart/.test(code);
			const isEvent = isEventFlag || looksLikeEvent;
			const dest = path.join(targetDir(isEvent), fileName);

			// Overwrite in place. An earlier version replied "already exists,
			// react to this message to overwrite it" and armed a reaction handler
			// on the bot's own reply — but that handler only fired if the user
			// reacted to the BOT's message (not the command), so a re-install
			// looked like it did nothing at all. Installing by URL is an explicit
			// request, so honour it and say what was replaced.
			const existed = fs.existsSync(dest);
			let previousCode = null;
			if (existed) {
				try { previousCode = fs.readFileSync(dest, "utf8"); }
				catch (_) { previousCode = null; }
			}
			try {
				const done = installFile(fileName, code, isEvent);
				if (done.error) return message.reply(`❌ ${done.error}`);
				const loaded = loadInto(registry, done.file, isEvent);
				return message.reply(
					`✅ ${existed ? "Updated" : "Installed"} "${loaded.name}" (${isEvent ? "event" : "command"}) ` +
					`from ${source || "code"} to ${isEvent ? "events" : "commands"}/${fileName} and reloaded it live.`
				);
			}
			catch (error) {
				// Do not leave a broken download in commands/. Restore the previous
				// file and registry entry when a URL has missing dependencies or bad
				// syntax, so the next command is not silently affected.
				try {
					if (previousCode != null) {
						fs.writeFileSync(dest, previousCode, "utf8");
						loadInto(registry, dest, isEvent);
					}
					else if (fs.existsSync(dest)) fs.unlinkSync(dest);
				}
				catch (_) { /* preserve the original install error */ }
				return message.reply(`❌ Install failed: ${String(error.message || error)}`);
			}
		}

		const known = ["load", "reload", "unload", "remove", "uninstall", "delete"];
		if (!known.includes(action)) {
			return message.reply(`❌ Unknown action "${action}". Use load, loadall, unload, uninstall, reload, list, template or install.`);
		}

		const name = rest[0];
		if (!name) return message.reply(`⚠️ Usage: ${config.prefix}cmd ${action} <name>`);

		const isEvent = isEventFlag || action.includes("event");
		const file = resolveFile(name, isEvent);

		if (action === "unload" || action === "reload" || action === "load") {
			if (!file) {
				return message.reply(
					`❌ File not found for "${name}" in ${path.relative(ROOT, targetDir(isEvent))}/.`
				);
			}
			if (action === "unload") {
				const removed = isEvent ? registry.unregisterEvent(name) : registry.unregisterCommand(name);
				if (!removed) return message.reply(`❌ No loaded ${isEvent ? "event" : "command"} named "${name}".`);
				return message.reply(`✅ Unloaded ${isEvent ? "event" : "command"} "${name}" live.`);
			}
			try {
				const loaded = loadInto(registry, file, isEvent);
				return message.reply(`✅ Reloaded ${isEvent ? "event" : "command"} "${loaded.name}" live.`);
			}
			catch (error) {
				return message.reply(`❌ Failed to load "${name}": ${String(error.message || error)}`);
			}
		}

		if (action === "remove" || action === "uninstall" || action === "delete") {
			const loadedScript = isEvent
				? registry.events.find(s => String(s.config.name).toLowerCase() === name.toLowerCase())
				: registry.resolve(name);
			const located = loadedScript && loadedScript.location ? path.resolve(loadedScript.location) : file;
			const removed = isEvent ? registry.unregisterEvent(name) : registry.unregisterCommand(name);
			let deleted = false;
			if (located && located.startsWith(targetDir(isEvent))) {
				try {
					fs.unlinkSync(located);
					deleted = true;
				}
				catch (_) { }
			}
			if (!removed && !deleted) return message.reply(`❌ No loaded ${isEvent ? "event" : "command"} named "${name}".`);
			return message.reply(
				`✅ ${deleted ? "Uninstalled" : "Unloaded"} ${isEvent ? "event" : "command"} "${name}" live` +
				`${deleted ? ` and deleted ${path.relative(ROOT, located)}` : ""}.`
			);
		}
	}
};
