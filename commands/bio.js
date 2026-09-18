"use strict";

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "bio",
		aliases: ["setbio", "biography"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "profile",
		cooldown: 5,
		role: 2,
		noPrefix: true,
		description: { en: "Change the bot account's biography" },
		usage: { en: "{p}bio <text>" }
	},

	onStart: async function ({ message, args, config, api }) {
		const lang = config.language;
		if (!args.length)
			return message.reply(t(lang, "bioEmpty"));
		const text = args.join(" ");
		try {
			await new Promise((resolve, reject) => {
				api.changeBio(text, (error, result) => error ? reject(error) : resolve(result));
			});
			return message.reply(t(lang, "bioChanged"));
		}
		catch (error) {
			return message.reply("Could not update the bio.\n" + String(error.message || error));
		}
	}
};
