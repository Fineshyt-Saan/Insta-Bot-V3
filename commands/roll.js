"use strict";

module.exports = {
	config: {
		name: "roll",
		aliases: ["dice"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "custom",
		cooldown: 3,
		role: 0,
		description: { en: "Roll a dice and remember a favourite number" },
		usage: { en: "{p}roll [sides]" }
	},

	onStart: async function ({ message, args, event, usersData, setReplyHandler }) {
		const sides = Number(args[0]) > 1 ? Math.floor(Number(args[0])) : 6;
		const value = 1 + Math.floor(Math.random() * sides);

		const sent = await message.reply(`Rolled a d${sides}: ${value}\nReply "pick <n>" to save a favourite.`);

		setReplyHandler(async ({ event: replyEvent, message: replyMessage }) => {
			const [action, n] = String(replyEvent.body || "").trim().split(/\s+/);
			if (action !== "pick" || !/^\d+$/.test(n)) return;
			const data = (usersData.get(replyEvent.senderID) || { }).data || { };
			usersData.update(replyEvent.senderID, { data: Object.assign({ }, data, { favourite: Number(n) }) });
			await replyMessage.reply(`Saved your favourite number: ${n}`);
		}, sent && sent.messageID);
	}
};
