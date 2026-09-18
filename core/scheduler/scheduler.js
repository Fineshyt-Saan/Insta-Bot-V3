"use strict";

/**
 * core/scheduler/scheduler.js
 *
 * Background tasks, cron jobs, and maintenance:
 * - Auto-uptime ping.
 * - Reminder checker.
 * - Temp file cleanup.
 * - Session verification.
 */

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const logger = require("../../utils/logger");

class Scheduler {
	constructor(bot) {
		this.bot = bot;
		this.config = bot.config;
		this.timers = [];
	}

	start() {
		this.startAutoUptime();
		this.startTempCleanup();
		this.startReminderChecker();
	}

	startAutoUptime() {
		if (!this.config.AUTO_UPTIME_ENABLE) return;
		const intervalMs = (this.config.AUTO_UPTIME_INTERVAL || 180) * 1000;
		const url = this.config.AUTO_UPTIME_URL;

		const timer = setInterval(async () => {
			if (url && /^https?:\/\//i.test(url)) {
				try {
					await axios.get(url, { timeout: 10000 });
				} catch (_) {}
			}
		}, intervalMs);

		if (timer.unref) timer.unref();
		this.timers.push(timer);
	}

	startTempCleanup() {
		const tempDir = path.resolve(this.config.TEMP_PATH || "./temp");
		fs.ensureDirSync(tempDir);

		const timer = setInterval(() => {
			try {
				const now = Date.now();
				const files = fs.readdirSync(tempDir);
				for (const f of files) {
					const fullPath = path.join(tempDir, f);
					const stat = fs.statSync(fullPath);
					if (now - stat.mtimeMs > 30 * 60 * 1000) {
						fs.unlink(fullPath).catch(() => {});
					}
				}
			} catch (_) {}
		}, 15 * 60 * 1000);

		if (timer.unref) timer.unref();
		this.timers.push(timer);
	}

	startReminderChecker() {
		const timer = setInterval(async () => {
			const database = global.db || require("../../utils/database");
			if (!database.getPendingReminders || !this.bot.api) return;

			try {
				const reminders = database.getPendingReminders();
				for (const rem of reminders) {
					if (rem.dueAt <= Date.now()) {
						const msg = `⏰ Reminder Alert!\n\n${rem.text || "You have a reminder!"}`;
						await this.bot.api.sendMessage(msg, rem.threadID).catch(() => {});
						database.deleteReminder(rem.id);
					}
				}
			} catch (_) {}
		}, 30000);

		if (timer.unref) timer.unref();
		this.timers.push(timer);
	}

	stop() {
		for (const t of this.timers) {
			clearInterval(t);
		}
		this.timers = [];
	}
}

module.exports = { Scheduler };
