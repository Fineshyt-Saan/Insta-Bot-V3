"use strict";

/**
 * thread.js — Manage group thread settings, prefix, and restrictions
 *
 * Authors: NeoKEX, frnAlt & Floppa Team
 */

module.exports = {
	config: {
		name: "thread",
		aliases: ["gc", "group", "threadsettings"],
		version: "2.0.0",
		author: "NeoKEX, 𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		cooldown: 3,
		role: 1,
		category: "admin",
		description: { en: "Manage group thread settings, prefix, and restrictions" },
		usage: { en: "{p}thread <info | prefix <val> | resetprefix | ban [id] | unban <id>>" }
	},

	onStart: async function ({ message, event, args, config, database, threadData, threadsData, role }) {
		const threadID = event.threadId || event.threadID;
		const uid = String(event.senderID || event.userID || "");
		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || {};
		if (!tData.settings) tData.settings = {};

		const isBotAdmin = (role != null && role >= 2) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid));

		function save() {
			if (threadsData && typeof threadsData.set === "function") threadsData.set(threadID, tData);
			if (database && typeof database.setThreadData === "function") database.setThreadData(threadID, tData);
			if (database && typeof database.save === "function") database.save();
		}

		const action = (args[0] || "info").toLowerCase();
		const p = (config && (config.prefix || config.PREFIX)) || "*";

		if (action === "info") {
			const activePrefix = tData.prefix || config.prefix || "*";
			const isBanned = Boolean(tData.banned?.status || tData.settings?.banned);
			const isOff = Boolean(tData.adminOnly || tData.settings?.adminOnly || tData.settings?.botOff);
			const autoTalk = Boolean(tData.autotalk || tData.settings?.autotalk);

			let infoMsg = "🗂️ 𝗧𝗛𝗥𝗘𝗔𝗗 𝗜𝗡𝗙𝗢 🗂️\n\n";
			infoMsg += `• Thread ID: ${threadID}\n`;
			infoMsg += `• Active Prefix: "${activePrefix}" ${tData.prefix ? "(Custom)" : "(Global)"}\n`;
			infoMsg += `• Bot Status: ${isOff ? "OFF 🔒 (Admin Only)" : "ON ✅ (Public)"}\n`;
			infoMsg += `• AI Auto-Talk: ${autoTalk ? "ENABLED 🗣️" : "DISABLED 🔇"}\n`;
			infoMsg += `• Banned: ${isBanned ? "🚫 YES" : "✅ NO"}\n`;
			if (Array.isArray(tData.adminIDs) && tData.adminIDs.length) {
				infoMsg += `• Admins: ${tData.adminIDs.length} registered\n`;
			}
			return message.reply(infoMsg);
		}

		if (action === "prefix") {
			if (!args[1]) return message.reply(`⚠️ Usage: ${p}thread prefix <newPrefix>`);
			const newPrefix = args[1].trim();
			if (newPrefix.length > 3) return message.reply("❌ The prefix must be 1 to 3 characters.");
			tData.prefix = newPrefix;
			save();
			return message.reply(`✅ Thread prefix set to: "${newPrefix}"`);
		}

		if (action === "resetprefix") {
			delete tData.prefix;
			save();
			return message.reply(`✅ Thread prefix reset to global default: "${config.prefix || '*'}"`);
		}

		if (action === "ban") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can ban threads.");
			const targetID = args[1] || threadID;
			const targetData = (database && typeof database.getThreadData === "function" ? database.getThreadData(targetID) : null) || {};
			if (!targetData.settings) targetData.settings = {};
			targetData.banned = { status: true, at: Date.now() };
			targetData.settings.banned = true;
			if (database && typeof database.setThreadData === "function") database.setThreadData(targetID, targetData);
			if (database && typeof database.save === "function") database.save();
			return message.reply(`🚫 Thread ${targetID} has been BANNED from using the bot.`);
		}

		if (action === "unban") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can unban threads.");
			const targetID = args[1] || threadID;
			const targetData = (database && typeof database.getThreadData === "function" ? database.getThreadData(targetID) : null) || {};
			if (!targetData.settings) targetData.settings = {};
			targetData.banned = { status: false };
			targetData.settings.banned = false;
			if (database && typeof database.setThreadData === "function") database.setThreadData(targetID, targetData);
			if (database && typeof database.save === "function") database.save();
			return message.reply(`✅ Thread ${targetID} has been UNBANNED.`);
		}

		return message.reply(`🔧 Thread Usage:\n• ${p}thread info\n• ${p}thread prefix <val>\n• ${p}thread resetprefix\n• ${p}thread ban [id]\n• ${p}thread unban <id>`);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
