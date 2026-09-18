"use strict";

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "echo",
		aliases: ["say"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "utility",
		cooldown: 2,
		role: 0,
		description: { en: "Repeat whatever you type after the command" },
		usage: { en: "{p}echo <text>" }
	},

	onStart: async function ({ message, args, config }) {
		if (!args.length)
			return message.reply(t(config.language, "echoEmpty"));
		return message.reply(args.join(" "));
	}
};
