"use strict";

const { resolveUserTarget, resolveProfile, isRateLimitError } = require("../src/utils");

module.exports = {
	config: {
		name: "pfp",
		aliases: ["profilepic", "getpfp", "userpic", "dp", "pp", "avatarof"],
		version: "2.5.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Send a user's profile picture" },
		usage: { en: "{p}pfp [userID | @handle | username | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api, usersData }) {
		let target = await resolveUserTarget(args, event, api);
		if (!target.id && (!args || args.length === 0) && event.senderID) {
			target = { id: String(event.senderID), source: "self" };
		}
		if (!target.id) {
			if (target.rateLimited) return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");
			if (target.username) return message.reply(`Could not find @${target.username}.`);
			return message.reply("Provide a numeric user id or @mention, or reply to a user's message.");
		}

		let profile = await resolveProfile(args && args.length > 0 ? args : [target.id], (args && args.length > 0) ? event : null, api);
		let picture = profile && profile.profilePicture;

		// Fallback 1: If picture is missing but we have a username, fetch fresh
		const username = (profile && profile.username) || target.username;
		if (!picture && username) {
			try {
				const { fetchInstagramProfile } = require("../src/utils");
				const fresh = await fetchInstagramProfile(username, 15000, true);
				if (fresh && fresh.profilePicture) {
					picture = fresh.profilePicture;
					profile = Object.assign({}, profile, fresh);
				}
			} catch (_) {}
		}

		// Fallback 2: Check database/usersData
		if (!picture && usersData && typeof usersData.get === "function") {
			try {
				const dbUser = await usersData.get(target.id);
				if (dbUser && dbUser.avatarUrl) {
					picture = dbUser.avatarUrl;
				}
			} catch (_) {}
		}

		if (!picture) {
			if (profile && profile.rateLimited) return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");
			return message.reply(`Could not find a profile picture for ${target.id}.`);
		}

		const name = (profile && (profile.name || profile.username)) || target.id;
		try {
			await message.reply({ attachment: picture, body: name, textFirst: true });
		} catch (sendErr) {
			// If sending remote picture URL directly fails, download locally with browser headers and retry
			const fs = require("fs-extra");
			const path = require("path");
			const axios = require("axios");
			const tempDir = path.join(process.cwd(), "temp");
			await fs.ensureDir(tempDir);
			const tempPath = path.join(tempDir, `pfp_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
			try {
				const res = await axios.get(picture, {
					responseType: "arraybuffer",
					timeout: 15000,
					headers: {
						"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						"Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
					}
				});
				const buf = Buffer.from(res.data);
				const str = buf.slice(0, 30).toString("utf8").toLowerCase();
				if (str.includes("<html") || str.includes("<!doctype") || str.includes("<?xml")) {
					throw new Error("Received HTML instead of image");
				}
				await fs.writeFile(tempPath, buf);
				await message.reply({ attachment: tempPath, body: name, textFirst: true });
				setTimeout(() => fs.unlink(tempPath).catch(() => {}), 20000);
			} catch (_) {
				if (fs.existsSync(tempPath)) fs.unlink(tempPath).catch(() => {});
				throw sendErr;
			}
		}
	}
};
