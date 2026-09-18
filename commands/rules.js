"use strict";

/**
 * rules.js — Create, view, add, and manage group chat rules
 *
 * Authors: NTKhang, frnAlt & Floppa Team
 */

module.exports = {
	config: {
		name: "rules",
		aliases: ["rule", "grouprules"],
		version: "2.0.0",
		author: "NTKhang, 𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		cooldown: 3,
		role: 0,
		category: "box chat",
		description: { en: "Create, view, add, and manage group chat rules" },
		usage: { en: "{p}rules [add <rule> | delete <number> | reset | view]" }
	},

	onStart: async function ({ role, args, message, event, threadsData, database, threadData, config }) {
		const threadID = event.threadId || event.threadID;
		const uid = String(event.senderID || event.userID || "");
		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || {};
		if (!tData.data) tData.data = {};
		const rulesOfThread = tData.data.rules || [];

		const isThreadAdmin = (role != null && role >= 1) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(event.isGroup === false) ||
			(Array.isArray(tData.adminIDs) && tData.adminIDs.map(a => String(a.id || a.userID || a)).includes(uid));

		function save() {
			tData.data.rules = rulesOfThread;
			if (threadsData && typeof threadsData.set === "function") threadsData.set(threadID, tData);
			if (database && typeof database.setThreadData === "function") database.setThreadData(threadID, tData);
			if (database && typeof database.save === "function") database.save();
		}

		const type = (args[0] || "").toLowerCase();
		const p = (config && (config.prefix || config.PREFIX)) || "*";

		if (!type || type === "view" || type === "list") {
			if (!rulesOfThread.length) {
				return message.reply(`📜 This group has no rules configured yet.\n\nUse "${p}rules add <rule>" to add one.`);
			}

			let msg = "📜 𝗚𝗥𝗢𝗨𝗣 𝗥𝗨𝗟𝗘𝗦 📜\n\n";
			rulesOfThread.forEach((rule, i) => {
				msg += `${i + 1}. ${rule}\n`;
			});
			msg += `\n➥ Reply with the rule number to view details.`;

			const sent = await message.reply(msg);
			const sentID = sent?.messageID;
			if (sentID) {
				if (global.GoatBot && global.GoatBot.onReply) {
					global.GoatBot.onReply.set(String(sentID), { commandName: "rules", rulesOfThread, author: uid });
				}
				if (global.client && Array.isArray(global.client.handleReply)) {
					global.client.handleReply.push({ name: "rules", messageID: sentID, rulesOfThread, author: uid });
				}
			}
			return sent;
		}

		if (["add", "-a"].includes(type)) {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can add rules.");
			const rule = args.slice(1).join(" ").trim();
			if (!rule) return message.reply(`Usage: ${p}rules add <rule text>`);
			rulesOfThread.push(rule);
			save();
			return message.reply(`✅ Rule #${rulesOfThread.length} added successfully!`);
		}

		if (["delete", "del", "-d", "remove"].includes(type)) {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can delete rules.");
			const index = parseInt(args[1], 10) - 1;
			if (isNaN(index) || index < 0 || index >= rulesOfThread.length) {
				return message.reply(`❌ Invalid rule number. Use "${p}rules" to see all numbers.`);
			}
			const removed = rulesOfThread.splice(index, 1);
			save();
			return message.reply(`✅ Deleted Rule #${index + 1}: "${removed[0]}"`);
		}

		if (["reset", "clear", "-c"].includes(type)) {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can reset rules.");
			rulesOfThread.length = 0;
			save();
			return message.reply("✅ All group rules have been cleared.");
		}

		return message.reply(`📜 Rules Usage:\n• ${p}rules — View rules\n• ${p}rules add <text>\n• ${p}rules delete <number>\n• ${p}rules reset`);
	},

	onReply: async function ({ message, event, Reply, replyData }) {
		const rData = Reply || replyData;
		const rules = rData?.rulesOfThread;
		if (!Array.isArray(rules) || !rules.length) return;
		const num = parseInt(event.body || event.text, 10);
		if (isNaN(num) || num < 1 || num > rules.length) return;
		return message.reply(`📜 Rule #${num}:\n${rules[num - 1]}`);
	},

	handleReply: async function (params) {
		return module.exports.onReply(params);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
