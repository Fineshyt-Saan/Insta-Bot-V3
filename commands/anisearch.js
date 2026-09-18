"use strict";

const API_BASE = "https://alldl.neokex.xyz/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_BYTES = Math.max(256 * 1024, Number(process.env.IG_MAX_MEDIA_BYTES) || 25 * 1024 * 1024);
const MAX_ATTEMPTS = 4;

const REACT_LOADING = "⏳";
const REACT_SUCCESS = "✅";
const REACT_FAIL = "❌";

function headersFor(url) {
	const headers = {
		"User-Agent": USER_AGENT,
		"Accept": "*/*",
		"Accept-Language": "en-US,en;q=0.9"
	};
	try {
		if (new URL(url).hostname.includes("tiktok")) headers.Referer = "https://www.tiktok.com/";
	}
	catch (_) { }
	return headers;
}

async function react(message, emoji) {
	try {
		await message.react(emoji);
	}
	catch (_) { }
}

async function requestJSON(url, timeout = 12000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { headers: headersFor(url), signal: controller.signal });
		if (!response.ok) throw new Error(`Media service returned HTTP ${response.status}`);
		return await response.json();
	}
	finally {
		clearTimeout(timer);
	}
}

async function searchVideos(query) {
	const payload = await requestJSON(`${API_BASE}/tik-sr?q=${encodeURIComponent(query)}`);
	const results = (payload && (payload.results || (payload.data && payload.data.results))) || [];
	const videos = results.map(item => item && item.url).filter(Boolean);
	if (!videos.length) throw new Error("No matching anime videos were found.");
	for (let i = videos.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[videos[i], videos[j]] = [videos[j], videos[i]];
	}
	return videos;
}

async function resolveVideo(url) {
	// 1. Fast TikWM attempt
	try {
		const tw = await requestJSON(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, 6000);
		if (tw && tw.data && (tw.data.play || tw.data.wmplay)) {
			const play = tw.data.play || tw.data.wmplay;
			const fullUrl = play.startsWith("http") ? play : `https://www.tikwm.com${play}`;
			return {
				title: tw.data.title || "Anime Video",
				url: fullUrl,
				ext: "mp4"
			};
		}
	}
	catch (_) { }

	// 2. NeoKEX alldl fallback
	try {
		const payload = await requestJSON(`${API_BASE}/alldl?url=${encodeURIComponent(url)}`, 10000);
		const data = (payload && (payload.metadata && payload.metadata.data)) || (payload && payload.data) || payload;
		const downloads = (data && data.downloads) || [];
		const notAudio = item => !String(item && item.label).toLowerCase().includes("audio");
		const download =
			downloads.find(item => item && item.url && item.ext === "mp4" && notAudio(item)) ||
			downloads.find(item => item && item.url && notAudio(item));
		if (data && data.title && download && download.url) {
			return { title: data.title, url: download.url, ext: String(download.ext || "mp4").toLowerCase() };
		}
	}
	catch (_) { }

	throw new Error("The media service did not return a usable video.");
}

async function fetchVideoBuffer(url, timeout = 15000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		let response = await fetch(url, { headers: headersFor(url), signal: controller.signal, redirect: "follow" }).catch(() => null);
		if (!response || !response.ok || response.status === 403) {
			response = await fetch(url, {
				headers: { "User-Agent": USER_AGENT, "Accept": "*/*" },
				signal: controller.signal,
				redirect: "follow"
			});
		}
		if (!response.ok) throw new Error(`Video download failed (HTTP ${response.status})`);
		const declared = Number(response.headers.get("content-length")) || 0;
		if (declared && declared > MAX_BYTES)
			throw new Error(`The video is ${Math.round(declared / 1048576)} MB, above the send limit.`);
		const buffer = Buffer.from(await response.arrayBuffer());
		if (!buffer.length) throw new Error("The video download was empty.");
		if (buffer.length > MAX_BYTES)
			throw new Error(`The video is ${Math.round(buffer.length / 1048576)} MB, above the send limit.`);
		return buffer;
	}
	finally {
		clearTimeout(timer);
	}
}

function describeError(error) {
	if (!error) return "Unknown error";
	const parts = [error.message, error.error, error.type]
		.map(value => (value == null ? "" : String(value).trim()))
		.filter(Boolean);
	const unique = [...new Set(parts)];
	return unique.length ? unique.join(" — ") : "Unknown error";
}

module.exports = {
	config: {
		name: "anisearch",
		aliases: ["anivid", "animevid"],
		author: "Neoaz 🐊",
		category: "media",
		cooldown: 5,
		role: 0,
		description: { en: "Find and send a random TikTok anime video for a query" },
		usage: { en: "{p}anisearch <anime or character>" }
	},

	onStart: async function ({ args, message, event }) {
		const reply = event && (event.messageReply || event.repliedMessage);
		const query = args.join(" ").trim() || (reply && (reply.body || reply.text)) || "";
		if (!query)
			return message.reply("Usage: anisearch <anime or character>\nExample: anisearch naruto");

		await react(message, REACT_LOADING);

		let candidates;
		try {
			candidates = await searchVideos(query);
		}
		catch (error) {
			await react(message, REACT_FAIL);
			return message.reply(`Could not find a video: ${describeError(error)}`);
		}

		let lastError = null;
		let lastUrl = null;
		let oversize = 0;
		let terminal = false;
		for (const url of candidates.slice(0, MAX_ATTEMPTS)) {
			try {
				const video = await resolveVideo(url);
				lastUrl = video.url;
				const buffer = await fetchVideoBuffer(video.url);
				await message.reply(String(video.title || "Here is your video.").slice(0, 200));
				await message.reply({ attachment: { buffer, fileName: "anisearch.mp4", type: "video" } });
				await react(message, REACT_SUCCESS);
				return;
			}
			catch (error) {
				lastError = error;
				const text = describeError(error);
				if (/above the send limit|too large/i.test(text)) oversize++;
				if (/not authorized|notauthorizederror|challenged|timed out|rate.?limit|429/i.test(text)) {
					terminal = true;
					break;
				}
			}
		}

		await react(message, REACT_FAIL);
		const detail = describeError(lastError);
		if (oversize && oversize >= Math.min(MAX_ATTEMPTS, candidates.length)) {
			return message.reply(
				"Every matching video was too large to send. " +
				"Raise the limit with IG_MAX_MEDIA_BYTES (and IG_MAX_BODY_BYTES on the server) to allow bigger files."
			);
		}
		if (lastUrl) {
			const hint = terminal
				? "This is an account/session problem, not a bad video — open Instagram as this account and clear any prompt, then try again."
				: "(If this keeps happening, the account is likely challenged — open Instagram and clear any prompt.)";
			return message.reply(
				`Found a video but Instagram refused the upload: ${detail}\n${lastUrl}\n${hint}`
			);
		}
		return message.reply(`Could not find a video: ${detail}`);
	}
};
