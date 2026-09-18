"use strict";

module.exports = {
	config: {
		name: "img",
		aliases: ["image", "sendimg"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "media",
		cooldown: 3,
		role: 0,
		description: { en: "Send an image from a URL or from a replied image" },
		usage: { en: "{p}img <imageURL> — or reply to an image with {p}img" }
	},

	onStart: async function ({ message, args, event }) {
		const sources = [];
		if (args[0] && /^https?:\/\//i.test(args[0])) sources.push(args[0]);
		const pools = [event.attachments, event.messageReply && event.messageReply.attachments].filter(Boolean);
		for (const pool of pools) {
			for (const att of pool) {
				if (["photo", "image", "animated_image"].includes(att.type) && att.url)
					sources.push(att.url);
			}
		}
		if (!sources.length)
			return message.reply("Give me an image URL, or reply to an image.");
		try {
			return await message.reply({ body: "", attachment: sources.slice(0, 4) });
		}
		catch (error) {
			return message.reply("Could not send the image.\n" + String(error.message || error));
		}
	}
};
