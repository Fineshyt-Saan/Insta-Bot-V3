"use strict";

/**
 * onMessage — runs for every incoming message event.
 * Records activity and keeps basic thread metadata fresh.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

module.exports = {
	config: {
		name: "onMessage",
		category: "system",
		// Both a plain message and a reply count as activity; an earlier config
		// listed only "message", so replies never updated lastActivity/members.
		eventType: ["message", "message_reply"]
	},

	onEvent: async function ({ event, threadsData }) {
		const patch = { lastActivity: Date.now() };
		if (event.isGroup != null) patch.isGroup = event.isGroup;
		if (Array.isArray(event.participantIDs) && event.participantIDs.length)
			patch.members = event.participantIDs.map(String);
		threadsData.update(event.threadID, patch);
	}
};
