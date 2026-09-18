"use strict";

/**
 * core/middleware/spamMiddleware.js
 *
 * Command flood and spam protection middleware.
 */

const SpamTracker = require("../../func/spamTracker");

function createSpamMiddleware(config = {}) {
	const tracker = new SpamTracker({
		commandThreshold: config.SPAM_COMMAND_THRESHOLD || 8,
		timeWindow: (config.SPAM_TIME_WINDOW || 10) * 1000,
		banDuration: (config.SPAM_BAN_DURATION || 24) * 60 * 60 * 1000,
		maxEntries: 1000,
		cleanupInterval: 60000
	});

	return {
		check(threadID, commandName) {
			if (!threadID) return { shouldBan: false, isBanned: false };
			if (tracker.isBanned(threadID)) {
				return { shouldBan: false, isBanned: true, info: tracker.getBanInfo(threadID) };
			}
			const result = tracker.trackCommand(threadID, commandName);
			return {
				shouldBan: result.shouldBan,
				isBanned: tracker.isBanned(threadID),
				info: result
			};
		},
		isBanned(threadID) {
			return tracker.isBanned(threadID);
		},
		ban(threadID, reason, duration) {
			return tracker.banThread(threadID, reason, duration);
		},
		unban(threadID) {
			return tracker.unbanThread(threadID);
		},
		tracker
	};
}

module.exports = { createSpamMiddleware };
