"use strict";

/**
 * onReaction — runs for reaction events.
 * Records reactions so commands can inspect them, and removes messages that
 * the bot's own admins mark with an angry reaction.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("../src/logger");

module.exports = {
	config: {
		name: "onReaction",
		category: "system",
		eventType: "message_reaction"
	},

	onEvent: async function ({ event, message, config, threadData, usersData, api }) {
		const senderID = String(event.senderID || event.userID || "").trim();
		if (!senderID) return;

		const targetID = event.targetMessageID || event.messageID;
		if (!targetID) return;

		const HAND_EMOJIS = [
			"✋", "🖐️", "🖐", "🤚", "👋", "👌", "👍", "👎",
			"✍️", "🤝", "🖕", "👊", "🤛", "🤜", "🤞", "🫰",
			"🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️",
			"👏", "🙌", "👐", "🤲", "🙏", "😡", "😠", "❌", "🗑️"
		];
		if (!event.reaction || typeof event.reaction !== "string") return;
		if (!HAND_EMOJIS.some(h => event.reaction.includes(h) || event.reaction === h)) return;
		if (event.reactionStatus === "deleted") return;

		const isBotAdmin = (api && typeof api.getCurrentUserID === "function" && String(api.getCurrentUserID() || "").trim() === senderID) || (config && (
			(Array.isArray(config.adminBot) && config.adminBot.map(String).includes(senderID)) ||
			(Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(senderID)) ||
			(Array.isArray(config.devUsers) && config.devUsers.map(String).includes(senderID)) ||
			(Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(senderID))
		));

		const rawAdmins = (threadData && (threadData.adminIDs || threadData.adminIds || threadData.admin_ids)) || [];
		const isBoxAdmin = (Array.isArray(rawAdmins) ? rawAdmins : []).map(a => {
			if (!a) return "";
			if (typeof a === "object") return String(a.id || a.userID || a.pk || a.uid || "").trim();
			return String(a).trim();
		}).includes(senderID);

		const isDM = !event.isGroup;

		if (isBotAdmin || isBoxAdmin || isDM) {
			try {
				if (typeof message?.unsend === "function") {
					await message.unsend(targetID);
				} else if (api && typeof api.unsendMessage === "function") {
					await new Promise((resolve, reject) => {
						api.unsendMessage(targetID, event.threadID, (err, res) => err ? reject(err) : resolve(res));
					});
				}
				log.info("REACTION", `${senderID} removed message ${targetID} via reaction ${event.reaction}`);
			}
			catch (error) {
				log.warn("REACTION", `Could not remove ${targetID}: ${error.message}`);
			}
		}
	}
};
