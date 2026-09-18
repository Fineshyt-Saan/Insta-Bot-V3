"use strict";

const HAND_EMOJIS = [
	"✋", "🖐️", "🖐", "🤚", "👋", "👌", "👍", "👎",
	"✍️", "🤝", "🖕", "👊", "🤛", "🤜", "🤞", "🫰",
	"🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️",
	"👏", "🙌", "👐", "🤲", "🙏", "🗑️", "❌", "😠", "😡"
];

module.exports = {
	config: {
		name: "unsend",
		aliases: ["uns", "delete", "del"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "utility",
		cooldown: 1,
		role: 0,
		description: { en: "Unsend a message: reply to any message and the bot removes it, or react with hand/trash emoji as admin" },
		usage: { en: "Reply to a message with {p}unsend or react with ✋/🗑️ to unsend" }
	},

	onStart: async function ({ message, event, api }) {
		const replied = event.messageReply;
		if (!replied || !replied.messageID) return;

		const threadID = event.threadID;
		const target = replied.messageID;

		try {
			await new Promise((resolve, reject) => {
				api.unsendMessage(target, threadID, (error, result) => error ? reject(error) : resolve(result));
			});
		}
		catch (_) { }
	},

	onReaction: async function ({ api, event, role, isBotAdmin, config }) {
		const reaction = event.reaction;
		if (!reaction || event.reactionStatus === "deleted") return;
		if (!HAND_EMOJIS.some(h => reaction.includes(h) || reaction === h)) return;

		const uid = String(event.userID || event.senderID || "").trim();
		const isAdmin = (role != null && role >= 1) ||
			(typeof isBotAdmin === "function" ? isBotAdmin(uid) : false) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.devUsers) && config.devUsers.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid));

		if (!isAdmin && event.isGroup) return;

		const targetID = event.targetMessageID || event.messageID;
		if (!targetID || !event.threadID) return;

		try {
			await new Promise((resolve, reject) => {
				api.unsendMessage(targetID, event.threadID, (error, result) => error ? reject(error) : resolve(result));
			});
		}
		catch (_) { }
	}
};
