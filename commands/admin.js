"use strict";

const t = require("../src/languages").text;
const { saveConfig } = require("../src/config");

module.exports = {
	config: {
		name: "admin",
		aliases: ["adminbot"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Add, remove or list bot admins" },
		usage: { en: "{p}admin add|remove|list [userID]" }
	},

	onStart: async function ({ message, args, event, config, role }) {
		const uid = String(event.senderID || event.userID || "").trim();
		const isBotAdmin = (role != null && role >= 2) || (
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.devUsers) && config.devUsers.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid))
		);
		if (!isBotAdmin) return;

		const lang = config.language;
		const action = (args.shift() || "list").toLowerCase();
		let target = args[0];
		if (!target && event.messageReply && event.messageReply.senderID)
			target = event.messageReply.senderID;
		if (target) target = String(target);

		if (action === "list") {
			const list = config.adminBot.length ? config.adminBot.join("\n") : "—";
			return message.reply(t(lang, "adminList", list));
		}

		if (target && !/^\d+$/.test(target)) {
			const clean = target.replace(/^@/, "").trim();
			try {
				const resolved = await require("../src/utils").resolveInstagramUserID(clean);
				if (resolved) target = String(resolved);
			} catch (_) {}
		}

		if (!target || !/^\d+$/.test(target))
			return message.reply("Provide a numeric Instagram user id or @handle (or reply to a user's message).");

		if (action === "add") {
			if (config.adminBot.map(String).includes(target))
				return message.reply(`${target} is already a bot admin.`);
			config.adminBot.push(target);
			if (Array.isArray(config.ADMIN_BOT) && !config.ADMIN_BOT.map(String).includes(target)) {
				config.ADMIN_BOT.push(target);
			}
			saveConfig(config);
			return message.reply(t(lang, "adminAddedUser", target));
		}

		if (action === "remove") {
			if (!config.adminBot.map(String).includes(target))
				return message.reply(`${target} is not a bot admin.`);
			config.adminBot = config.adminBot.filter(id => String(id) !== target);
			if (Array.isArray(config.ADMIN_BOT)) {
				config.ADMIN_BOT = config.ADMIN_BOT.filter(id => String(id) !== target);
			}
			saveConfig(config);
			return message.reply(t(lang, "adminRemovedUser", target));
		}

		return message.reply(`Unknown action "${action}". Use add, remove or list.`);
	}
};
