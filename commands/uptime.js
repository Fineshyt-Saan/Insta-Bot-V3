"use strict";

const os = require("os");
const utils = require("../src/utils");

const AVATAR_EFFECTS = ["love", "angry", "laugh", "cry"];

function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
	seconds = Math.max(0, Math.floor(seconds));
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;
	return [
		days && `${days}d`,
		hours && `${hours}h`,
		minutes && `${minutes}m`,
		`${remainingSeconds}s`
	].filter(Boolean).join(" ");
}

function randomAvatarEffect() {
	return AVATAR_EFFECTS[Math.floor(Math.random() * AVATAR_EFFECTS.length)];
}

module.exports = {
	config: {
		name: "uptime",
		aliases: ["up", "upt", "runtime"],
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		category: "info",
		cooldown: 2,
		role: 0,
		description: { en: "View bot runtime, host, and memory information" },
		usage: { en: "{p}uptime" }
	},

	onStart: async function ({ message, config }) {
		let version = "1.0.0";
		try { version = require("../package.json").version; } catch (_) { }

		const memory = process.memoryUsage();
		const totalMemory = os.totalmem();
		const freeMemory = os.freemem();
		const usedMemory = totalMemory - freeMemory;
		const since = global.instabotStartedAt || Date.now();
		const startedAt = new Date(since).toISOString().replace("T", " ").replace(/\..+$/, " UTC");

		const body = [
			"╭────────────────────⭓",
			`│ ☠️ ${String((config && config.botName) || "InstaBOT").toUpperCase()} ☠️`,
			"├────────────────────⭔",
			"├── ❏ RUNTIME ❏ ──⭔",
			`│   ▪ Uptime: ${utils.formatTime(Date.now() - since)}`,
			`│   ▪ Process: ${formatDuration(process.uptime())}`,
			`│   ▪ Started: ${startedAt}`,
			"├── ❏ HOST ❏ ──⭔",
			`│   ▪ Name: ${os.hostname()}`,
			`│   ▪ Platform: ${process.platform}/${process.arch}`,
			`│   ▪ CPU: ${os.cpus().length} cores`,
			"├── ❏ MEMORY ❏ ──⭔",
			`│   ▪ Host used: ${formatBytes(usedMemory)}`,
			`│   ▪ Host free: ${formatBytes(freeMemory)}`,
			`│   ▪ Host total: ${formatBytes(totalMemory)}`,
			`│   ▪ Bot RSS: ${formatBytes(memory.rss)}`,
			`│   ▪ Bot heap: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
			"├────────────────────⭔",
			`│ Node ${process.version} · v${version}`,
			"╰────────────────────⭔"
		].join("\n");

		try {
			return await message.send({ body, avatarEffect: randomAvatarEffect() });
		}
		catch (_) {
			return message.send(body);
		}
	}
};
