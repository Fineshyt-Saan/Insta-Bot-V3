"use strict";

module.exports = {
	config: {
		name: "effect",
		aliases: ["fx"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "utility",
		cooldown: 3,
		role: 0,
		description: { en: "Send text with an Instagram power-up effect" },
		usage: { en: "{p}effect <love|gift|celebration|fire> <text>" }
	},

	onStart: async function ({ message, args }) {
		const effects = ["love", "gift", "celebration", "fire"];
		const effect = (args.shift() || "").toLowerCase();
		if (!effects.includes(effect))
			return message.reply(`Pick an effect: ${effects.join(", ")}.\nExample: effect fire Hello!`);
		const text = args.join(" ") || "✨";
		try {
			await message.effect(text, effect);
		}
		catch (error) {
			return message.reply(String(error.message || error));
		}
	}
};
