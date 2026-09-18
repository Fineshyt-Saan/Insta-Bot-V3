"use strict";

const { resolveUserTarget, resolveProfile } = require("../src/utils");
function number(value) {
	return value == null ? "—" : Number(value).toLocaleString("en-US");
}

module.exports = {
	config: {
		name: "info",
		aliases: ["whois", "userinfo", "profile"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Show an Instagram user's profile details" },
		usage: { en: "{p}info [userID | @handle | username | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {
		const target = await resolveUserTarget(args, event, api);
		if (!target.id) {
			if (target.rateLimited) return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");
			if (target.username) return message.reply(`Could not find @${target.username}.`);
			return message.reply("Provide a numeric user id or @mention, or reply to a user's message.");
		}

		const profile = await resolveProfile(args, event, api);
		if (!profile) return message.reply(`Could not find user ${target.id}.`);
		if (profile.rateLimited && !profile.username && !profile.name)
			return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");

		const badges = [profile.isVerified ? "✅ Verified" : null, profile.isPrivate ? "🔒 Private" : "🌐 Public"]
			.filter(Boolean).join(" · ");

		const lines = [
			`👤 ${profile.name || profile.username || target.id}`,
			`@${profile.username || "—"}`,
			`🆔 ${profile.userID || target.id}`,
			badges,
			`👥 Followers: ${number(profile.followers)}`,
			`➡️ Following: ${number(profile.following)}`,
			profile.posts != null ? `🖼️ Posts: ${number(profile.posts)}` : null,
			profile.biography ? `\n📝 ${profile.biography}` : null
		].filter(Boolean);

		const picture = profile.profilePicture;
		if (picture) return message.reply({ attachment: picture, body: lines.join("\n"), textFirst: true });
		return message.reply(lines.join("\n"));
	}
};
