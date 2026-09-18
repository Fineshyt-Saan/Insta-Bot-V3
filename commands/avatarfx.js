"use strict";

const EFFECTS = {
	love: ["love", "heart"],
	angry: ["angry", "mad"],
	laugh: ["laugh", "lol"],
	cry: ["cry", "sad"]
};

module.exports = {
	config: {
		name: "avatarfx",
		aliases: ["avfx", "avatar-effect"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "utility",
		cooldown: 3,
		role: 0,
		description: { en: "Send text with an animated avatar character effect" },
		usage: { en: "{p}avatarfx <love|angry|laugh|cry> <text>" }
	},

	onStart: async function ({ message, args }) {
		const key = (args.shift() || "").toLowerCase();
		const effect = Object.keys(EFFECTS).find(name => EFFECTS[name].includes(key));
		if (!effect)
			return message.reply(`Pick an effect: ${Object.keys(EFFECTS).join(", ")}.\nExample: avatarfx laugh Nice one!`);

		const text = args.join(" ") || "✨";
		try {
			await message.avatarEffect(text, effect);
		}
		catch (error) {
			return message.reply(String(error && error.message || error));
		}
	}
};
