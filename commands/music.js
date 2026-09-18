"use strict";

function formatDuration(ms) {
	if (!ms || ms < 0) return "0:00";
	const total = Math.round(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = String(total % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

async function searchTracks(query, message, config) {
	const music = (config && config.music) || { };

	async function fromInstagram() {
		const result = await message.musicSearch(query);
		return (result && result.tracks) || [];
	}

	if (music.enable !== false && music.apiUrl) {
		const url = music.apiUrl.includes("{query}")
			? music.apiUrl.replace("{query}", encodeURIComponent(query))
			: `${music.apiUrl}${music.apiUrl.includes("?") ? "&" : "?"}query=${encodeURIComponent(query)}`;
		const headers = { "Accept": "application/json" };
		if (music.apiToken) headers["Authorization"] = `Bearer ${music.apiToken}`;
		try {
			const res = await fetch(url, { headers });
			if (!res.ok) throw new Error(`music server responded ${res.status}`);
			const tracks = normalizeTracks(await res.json());
			if (tracks.length) return tracks;
		}
		catch (_) { }
	}

	return fromInstagram();
}

function normalizeTracks(data) {
	const list = Array.isArray(data) ? data
		: Array.isArray(data && data.tracks) ? data.tracks
			: Array.isArray(data && data.results) ? data.results
				: Array.isArray(data && data.data) ? data.data : [];
	return list.map(entry => ({
		audioAssetID: entry.audioAssetID || entry.audio_asset_id || null,
		audioClusterID: entry.audioClusterID || entry.audio_cluster_id || entry.id || null,
		id: entry.id || entry.audioClusterID || entry.audio_cluster_id || null,
		title: entry.title || entry.name || "Unknown",
		artist: entry.artist || entry.display_artist || "Unknown",
		durationMs: entry.durationMs || entry.duration_ms || entry.duration || 0,
		coverArt: entry.coverArt || entry.cover || entry.thumbnail || null
	})).filter(track => track.audioClusterID || track.audioAssetID);
}

module.exports = {
	config: {
		name: "music",
		aliases: ["stickermusic", "sm", "m"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "media",
		cooldown: 5,
		role: 0,
		description: { en: "Search a song and send it as an Instagram music sticker" },
		usage: { en: "{p}music <song name or artist> | {p}music <number> to pick from the last search" }
	},

	onStart: async function ({ message, args, event, config, usersData, setReplyHandler, api, invokedAs }) {
		if (!Array.isArray(api?.calls) && !args.includes("--sticker") && !args.includes("--list")) {
			const singCmd = require("./sing");
			return singCmd.onStart({ message, args, event, config, usersData, setReplyHandler, api, invokedAs: "music" });
		}

		const reply = event.messageReply || event.repliedMessage;
		const query = args.join(" ").trim() || (reply && (reply.body || reply.text)) || "";
		if (!query)
			return message.reply(`Usage: music <song name>\nExample: music blinding lights`);

		const last = (usersData && typeof usersData.get === "function") ? (usersData.get(event.senderID) || { }) : { };
		const cached = last.data && last.data.lastMusic;

		if (/^\d+$/.test(query) && cached && Array.isArray(cached.tracks) && cached.tracks.length) {
			const index = Number(query) - 1;
			const track = cached.tracks[index];
			if (!track)
				return message.reply(`Pick a number between 1 and ${cached.tracks.length}.`);
			return sendTrack(message, track);
		}

		let tracks;
		try {
			tracks = await searchTracks(query, message, config);
		}
		catch (error) {
			return message.reply(`Music search failed: ${String(error.message || error)}`);
		}

		if (!tracks.length)
			return message.reply(`No songs found for "${query}".`);

		const top = tracks.slice(0, 10);
		if (usersData && typeof usersData.update === "function") {
			usersData.update(event.senderID, { data: Object.assign({ }, last.data, { lastMusic: { query, tracks: top } }) });
		}

		if (top.length === 1 || args.includes("--top"))
			return sendTrack(message, top[0]);

		const lines = top.map((track, index) =>
			`${index + 1}. ${track.title || "Unknown"} — ${track.artist || "Unknown"} (${formatDuration(track.durationMs)})`
		);
		const sent = await message.reply(
			`Results for "${query}"\n${lines.join("\n")}\n\nReply with music <number> to send one.`
		);

		if (typeof setReplyHandler === "function" && sent?.messageID) {
			setReplyHandler(async ({ message: replyMessage, event: replyEvent }) => {
				const pick = String(replyEvent.body || "").trim().split(/\s+/).pop();
				if (!/^\d+$/.test(pick)) return;
				const chosen = top[Number(pick) - 1];
				if (!chosen) return replyMessage.reply(`Pick a number between 1 and ${top.length}.`);
				await sendTrack(replyMessage, chosen);
			}, sent && sent.messageID);
		}
		return sent;
	}
};

async function sendTrack(message, track) {
	if (!track) return message.reply("That track is no longer available. Search again.");
	try {
		await message.music(track);
	}
	catch (error) {
		return message.reply(`Could not send "${track.title || "the track"}": ${String(error.message || error)}`);
	}
}
