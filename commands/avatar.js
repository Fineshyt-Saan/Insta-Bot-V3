"use strict";

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "avatar",
		aliases: ["setavatar", "setavt"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "profile",
		cooldown: 5,
		role: 2,
		noPrefix: true,
		description: { en: "Change the bot account's profile picture (irreversible)" },
		usage: { en: "{p}avatar <imageURL> — or reply to an image" }
	},

	onStart: async function ({ message, args, event, config, api }) {
		const lang = config.language;
		const { extractImageUrl } = require("../src/utils");
		let source = (await extractImageUrl(event, args, api)) || pickImage(event.messageReply && event.messageReply.attachments) || pickImage(event.attachments) || args[0];

		if (!source || !/^https?:\/\//i.test(source))
			return message.reply("Provide an image URL, or reply to an image with -avatar.");

		try {
			await new Promise((resolve, reject) => {
				api.changeProfilePicture(source, (error, result) => error ? reject(error) : resolve(result));
			});
			return message.reply(t(lang, "avatarChanged"));
		}
		catch (error) {
			return message.reply(t(lang, "avatarFailed") + "\n" + String(error.message || error));
		}
	}
};

function pickImage(attachments) {
	if (!Array.isArray(attachments)) return null;
	for (const att of attachments) {
		if (!att || typeof att !== "object") continue;
		if (!/^(photo|image|animated_image|video)$/.test(String(att.type))) continue;
		const url = att.url || att.largePreviewUrl || att.previewUrl || att.thumbnailUrl || att.large_preview_url;
		if (url && /^https?:\/\//i.test(url)) return url;
	}
	return null;
}
