"use strict";

/**
 * autotalk.js — Toggle Auto-Talk AI chatbot system for this chat
 *
 * Authors: Jisan, frnAlt & Floppa Team
 */

module.exports = {
	config: {
		name: "autotalk",
		aliases: ["atalk", "chatbot", "simtalk", "talk", "botchat"],
		version: "2.0.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		cooldown: 3,
		role: 0,
		category: "ai",
		description: { en: "Toggle Auto-Talk AI chatbot system for this chat" },
		usage: { en: "{p}autotalk [on | off | status]" }
	},

	onStart: async function ({ message, event, args, database, threadData, threadsData, role, config }) {
		const threadID = event.threadId || event.threadID;
		const uid = String(event.senderID || event.userID || "");
		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || {};
		if (!tData.settings) tData.settings = {};

		const isThreadAdmin = (role != null && role >= 1) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(event.isGroup === false) ||
			(Array.isArray(tData.adminIDs) && tData.adminIDs.map(a => String(a.id || a.userID || a)).includes(uid));

		function save() {
			if (threadsData && typeof threadsData.set === "function") threadsData.set(threadID, tData);
			if (database && typeof database.setThreadData === "function") database.setThreadData(threadID, tData);
			if (database && typeof database.save === "function") database.save();
		}

		const mode = args[0] ? args[0].toLowerCase() : null;

		if (mode === "on" || mode === "enable") {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can enable auto-talk.");
			tData.autotalk = true;
			tData.settings.autotalk = true;
			save();
			return message.reply("🗣️ Auto-Talk Chatbot has been ENABLED for this chat! The bot will automatically chat with users.");
		}

		if (mode === "off" || mode === "disable") {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can disable auto-talk.");
			tData.autotalk = false;
			tData.settings.autotalk = false;
			save();
			return message.reply("🔇 Auto-Talk Chatbot has been DISABLED for this chat.");
		}

		const currentState = Boolean(tData.autotalk === true || tData.settings.autotalk === true);
		const p = (config && (config.prefix || config.PREFIX)) || "*";
		return message.reply(`🗣️ Auto-Talk Status: ${currentState ? "ENABLED ✅" : "DISABLED ❌"}\n\nUsage:\n• ${p}autotalk on — Enable auto-talk\n• ${p}autotalk off — Disable auto-talk`);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
