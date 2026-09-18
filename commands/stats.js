/**
 * Performance Stats Command - Text-based system statistics
 * Usage: {prefix}stats
 */

const cooldownManager = require("../func/cooldownManager.js");
const analyticsBatcher = require("../func/analyticsBatcher.js");
const os = require("os");
const process = require("process");

function formatBytes(bytes) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatUptime(seconds) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = {
	config: {
		name: "stats",
		version: "3.0.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		countDown: 5,
		role: 0,
		shortDescription: {
			en: "View bot system statistics"
		},
		longDescription: {
			en: "View detailed performance metrics including memory usage, uptime, command stats, and active optimizations"
		},
		category: "system",
		guide: {
			en: "{pn} - View system stats\n{pn} clear - Trigger garbage collection"
		}
	},

	onStart: async function ({ message, args }) {
		if (args[0] === "clear") {
			if (global.gc) {
				global.gc();
				return message.reply("[ SYSTEM ] Garbage collector triggered successfully.");
			}
			return message.reply("[ SYSTEM ] GC not exposed. Start with --expose-gc flag.");
		}

		try {
			// System Info
			const uptime = formatUptime(process.uptime());
			const memory = process.memoryUsage();
			const totalMem = os.totalmem();
			const freeMem = os.freemem();

			// Bot Stats
			const commandCount = global.GoatBot?.commands?.size || 0;
			const eventCount = global.GoatBot?.eventCommands?.size || 0;
			const aliasCount = global.GoatBot?.aliases?.size || 0;
			const threadCount = global.db?.allThreadData?.length || 0;
			const userCount = global.db?.allUserData?.length || 0;

			// Performance Stats
			const cooldownStats = cooldownManager.getStats();
			const analyticsStats = analyticsBatcher.getStats();

			// Get real optimization status
			const config = global.GoatBot?.config || {};
			const typingEnabled = config.typingIndicator?.enable === true ? "ON" : "OFF";
			const spamStatus = global.client?.spamTracker ? `ON (${global.client.spamTracker.size || 0} tracked)` : "OFF";
			const cooldownEntries = cooldownStats.totalEntries || 0;
			const analyticsPending = analyticsStats.bufferSize || 0;

			// Build the message with up command design
			const statsMsg = 
				`┌─── BOT STATISTICS ───×\n` +
				`│\n` +
				`│ [~] Uptime: ${uptime}\n` +
				`│ [~] Commands: ${commandCount}\n` +
				`│ [~] Events: ${eventCount}\n` +
				`│ [~] Aliases: ${aliasCount}\n` +
				`│ [~] Threads: ${threadCount}\n` +
				`│ [~] Users: ${userCount}\n` +
				`│\n` +
				`├─── MEMORY USAGE ───×\n` +
				`│ [~] Heap Used: ${formatBytes(memory.heapUsed)}\n` +
				`│ [~] Heap Total: ${formatBytes(memory.heapTotal)}\n` +
				`│ [~] RSS: ${formatBytes(memory.rss)}\n` +
				`│ [~] External: ${formatBytes(memory.external)}\n` +
				`│\n` +
				`├─── SYSTEM MEMORY ───×\n` +
				`│ [~] Total: ${formatBytes(totalMem)}\n` +
				`│ [~] Free: ${formatBytes(freeMem)}\n` +
				`│ [~] Used: ${formatBytes(totalMem - freeMem)}\n` +
				`│\n` +
				`├─── PERFORMANCE ───×\n` +
				`│ [~] Cooldown Checks: ${cooldownStats.totalChecks}\n` +
				`│ [~] Blocked Commands: ${cooldownStats.blocked}\n` +
				`│ [~] Analytics Buffered: ${analyticsStats.buffered}\n` +
				`│ [~] Analytics Flushed: ${analyticsStats.flushed}\n` +
				`│\n` +
				`├─── OPTIMIZATIONS ───×\n` +
				`│ [~] Spam Tracker: ${spamStatus}\n` +
				`│ [~] Cooldown Manager: ON (${cooldownEntries} entries)\n` +
				`│ [~] Analytics Batching: ON (${analyticsPending} pending)\n` +
				`│ [~] Typing Indicator: ${typingEnabled}\n` +
				`│ [~] Graceful Shutdown: ON\n` +
				`└───────────────×\n` +
				`Node.js ${process.version} | ${os.platform()} ${os.arch()} | ${new Date().toLocaleString()}`;

			return message.reply(statsMsg);
		} catch (err) {
			console.error("Stats error:", err);
			return message.reply("[ ERROR ] Failed to generate stats: " + err.message);
		}
	}
};
