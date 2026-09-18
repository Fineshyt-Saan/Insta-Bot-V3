"use strict";

const t = require("../src/languages").text;
const { saveConfig } = require("../src/config");

module.exports = {
	config: {
		name: "whitelist",
		aliases: ["wl"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Manage whitelist mode and its entries" },
		usage: { en: "{p}whitelist on|off | {p}whitelist add|remove user|thread [id] | {p}whitelist list" }
	},

	onStart: async function ({ message, args, event, config }) {
		const lang = config.language;
		const action = (args.shift() || "list").toLowerCase();
		const list = config.whiteList;

		if (action === "on" || action === "off") {
			list.enable = action === "on";
			saveConfig(config);
			return message.reply(`Whitelist mode is now ${action.toUpperCase()}.`);
		}

		if (action === "list") {
			return message.reply(
				`Whitelist mode: ${list.enable ? "ON" : "OFF"}\n` +
				`Users: ${list.userIDs.join(", ") || "—"}\n` +
				`Threads: ${list.threadIDs.join(", ") || "—"}`
			);
		}

		if (action === "add" || action === "remove") {
			const kind = (args.shift() || "").toLowerCase();
			let id = args[0];
			if (!id && event.messageReply && event.messageReply.senderID) id = event.messageReply.senderID;
			if (!id && (kind === "thread" || kind === "box")) id = event.threadID;
			if (!id) return message.reply("Provide an id, or reply to a user's message.");

			const target = kind === "thread" || kind === "box" ? list.threadIDs : list.userIDs;
			const key = String(id);
			if (action === "add") {
				if (!target.includes(key)) target.push(key);
				saveConfig(config);
				return message.reply(t(lang, "whitelistAdded", key));
			}
			const filtered = target.filter(item => item !== key);
			if (kind === "thread" || kind === "box") list.threadIDs = filtered;
			else list.userIDs = filtered;
			saveConfig(config);
			return message.reply(t(lang, "whitelistRemoved", key));
		}

		return message.reply(`Unknown action "${action}".`);
	}
};
