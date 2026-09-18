"use strict";

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "ping",
		aliases: ["pong"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "info",
		cooldown: 2,
		role: 0,
		description: { en: "Check whether the bot is online" },
		usage: { en: "{p}ping" }
	},

	onStart: async function ({ message, config }) {
		const start = Date.now();
		await message.reply(t(config.language, "pingProcessing"));
		return message.send(t(config.language, "pingResult", Date.now() - start));
	}
};
