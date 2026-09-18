"use strict";

module.exports = {
	config: {
		name: "theme",
		aliases: ["themes"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "utility",
		cooldown: 3,
		role: 0,
		description: { en: "Instagram Direct theme notice" },
		usage: { en: "{p}theme" }
	},

	onStart: async function ({ message }) {
		const notice = "⚠️ Changing thread themes is not supported on Instagram Direct.";
		return message.reply ? message.reply(notice) : message.send(notice);
	}
};
