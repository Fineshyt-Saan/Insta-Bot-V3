"use strict";

const TEXT_EFFECTS = ["love", "gift", "celebration", "fire"];

function cleanCategoryName(text) {
	if (!text) return "others";
	return String(text)
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase() || "others";
}

function randomTextEffect() {
	return TEXT_EFFECTS[Math.floor(Math.random() * TEXT_EFFECTS.length)];
}

module.exports = {
	config: {
		name: "help",
		aliases: ["h", "menu", "commands"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Show all available commands or details for one" },
		usage: { en: "{p}help [command]" }
	},

	onStart: async function ({ message, args, config, registry, bot, event }) {
		const reg = registry || (bot && bot.commandLoader) || global.registry;
		const prefix = (config && (config.prefix || config.PREFIX)) || "*";
		const query = (args[0] || "").toLowerCase();

		const getCmd = q => {
			if (!reg) return null;
			if (typeof reg.resolve === "function") return reg.resolve(q);
			if (typeof reg.get === "function") return reg.get(q);
			if (typeof reg.getCommand === "function") return reg.getCommand(q);
			if (reg.commands && typeof reg.commands.get === "function") return reg.commands.get(q);
			return null;
		};

		if (query) {
			const command = getCmd(query);
			if (!command) return message.reply ? message.reply(`❌ Command "${query}" not found.`) : message.send(`❌ Command "${query}" not found.`);

			const c = command.config || command;
			const lang = (config && config.language) || "en";
			const description = (c.description && (c.description[lang] || c.description.en)) || "—";
			const usage = ((c.usage && (c.usage[lang] || c.usage.en)) || `${prefix}${c.name}`).replace(/\{p\}/g, prefix);

			let version = "1.0.0";
			try { version = require("../package.json").version; } catch (_) { }

			const body = [
				"☠️ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗜𝗡𝗙𝗢 ☠️",
				"",
				`➥ Name: ${c.name}`,
				`➥ Category: ${c.category || "Uncategorized"}`,
				`➥ Description: ${description}`,
				`➥ Aliases: ${c.aliases && c.aliases.length ? c.aliases.join(", ") : "None"}`,
				`➥ Usage: ${usage}`,
				`➥ Permission: ${c.role || 0}`,
				`➥ Author: ${c.author || "—"}`,
				`➥ Version: ${version}`
			].join("\n");

			try {
				return await (message.reply ? message.reply({ body, effect: randomTextEffect() }) : message.send({ body, effect: randomTextEffect() }));
			}
			catch (_) {
				return message.reply ? message.reply(body) : message.send(body);
			}
		}

		const byCategory = { };
		let cmdList = [];
		if (reg) {
			if (reg.commands && typeof reg.commands.values === "function") {
				cmdList = Array.from(reg.commands.values());
			} else if (Array.isArray(reg.commands)) {
				cmdList = reg.commands;
			} else if (reg.commands && typeof reg.commands === "object") {
				cmdList = Object.values(reg.commands);
			}
		}

		for (const command of cmdList) {
			const c = command.config || command;
			if (c.hidden) continue;
			const category = cleanCategoryName(c.category);
			(byCategory[category] = byCategory[category] || []).push(c.name);
		}

		const lines = [`━━━☠️ ${String((config && (config.botName || config.BOT_NAME)) || "InstaBOT").toUpperCase()} ☠️━━━`];
		for (const category of Object.keys(byCategory).sort()) {
			lines.push(`\n╭──『 ${category.toUpperCase()} 』`);
			const names = byCategory[category].sort();
			lines.push(names.map((name, index) => `${index === 0 ? "➥" : " "}× ${prefix}${name}`).join("  "));
			lines.push("╰────────────◊");
		}
		lines.push(`\n➥ Use: ${prefix}help [command] for details`);
		lines.push(`👤 Dev: 𝐒𝐀𝐀𝐍 𝐄𝐗𝐇𝐀𝐔𝐒𝐓𝐄𝐃)`);

		const body = lines.join("\n");
		let sent;
		try {
			sent = await (message.reply ? message.reply({ body, effect: randomTextEffect() }) : message.send({ body, effect: randomTextEffect() }));
		}
		catch (_) {
			sent = await (message.reply ? message.reply(body) : message.send(body));
		}

		const sentID = sent?.messageID;
		if (sentID) {
			if (global.GoatBot && global.GoatBot.onReply) {
				global.GoatBot.onReply.set(String(sentID), { commandName: "help", author: event?.senderID });
			}
			if (global.client && Array.isArray(global.client.handleReply)) {
				global.client.handleReply.push({ name: "help", messageID: sentID, author: event?.senderID });
			}
		}
		return sent;
	},

	onReply: async function ({ message, event, registry, bot, config }) {
		const query = ((event && (event.body || event.text)) || "").trim().toLowerCase();
		if (!query) return;
		return module.exports.onStart({ message, args: [query], config, registry, bot, event });
	},

	handleReply: async function (params) {
		return module.exports.onReply(params);
	}
};
