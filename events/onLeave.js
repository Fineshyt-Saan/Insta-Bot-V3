"use strict";

/**
 * onLeave — say goodbye when a member leaves (or is removed from) a thread.
 *
 * Configure in config.json:
 *   "leave": {
 *     "enable": true,
 *     "message": "%1 left %2. 👋",   // %1 = user, %2 = thread name
 *     "threadIDs": []                 // empty = every thread
 *   }
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("../src/logger");

function fill(template, values) {
	return String(template).replace(/%(\d+)/g, (match, index) => {
		const value = values[Number(index) - 1];
		return value == null ? "" : String(value);
	});
}

module.exports = {
	config: {
		name: "onLeave",
		category: "system",
		eventType: "leave",
		description: { en: "Notify when a member leaves a group thread" }
	},

	onEvent: async function ({ api, event, message, config, threadsData, usersData }) {
		const settings = config.leave || {};
		if (settings.enable === false) return;

		const threadID = event.threadID;
		if (Array.isArray(settings.threadIDs) && settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))) return;

		const thread = (threadsData && typeof threadsData.get === "function" ? threadsData.get(threadID) : null) || {};
		const isBotOff = thread.adminOnly === true || thread.settings?.adminOnly === true || thread.settings?.botOff === true;
		const isEventsOff = thread.eventsOff === true || thread.settings?.eventsOff === true || thread.settings?.leave === false;
		if (isBotOff || isEventsOff) return;

		// Instagram's action_log carries the affected member as an @handle in
		// `usernames`; some payloads also carry numeric ids. Announce by
		// USERNAME, not the numeric id.
		//
		// `senderID`/`userID` in a membership event is the ACTOR (who removed the
		// member), NOT the member — using it as a fallback announced the actor as
		// well. Only `participantID`/`userIDs` name the affected member.
		const usernames = Array.isArray(event.usernames) ? event.usernames.map(String).filter(Boolean) : [];
		const ids = (event.userIDs && event.userIDs.length
			? event.userIDs
			: (event.participantID ? [event.participantID] : []))
			.filter(Boolean).map(String);

		if (!usernames.length && !ids.length) return;

		const targets = [];
		for (const name of usernames) targets.push({ username: name, userID: null });
		for (const id of ids) {
			if (targets.some(t => t.userID === id)) continue;
			targets.push({ username: null, userID: id });
		}
		if (!targets.length) return;

		let threadName = thread.name;
		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) => error ? reject(error) : resolve(result)));
				threadName = info && info.name;
				if (threadName) threadsData.update(threadID, { name: threadName });
			}
			catch (_) { /* name is optional */ }
		}

		const template = settings.message || "%1 left %2. 👋";
		const seen = new Set();

		for (const target of targets) {
			let username = target.username;
			let display = null;

			// A stored name lets us still name someone who just left.
			if (!username && target.userID) {
				const stored = usersData.get(target.userID) || {};
				username = stored.username || null;
				display = stored.name || null;
			}
			if (!username && target.userID) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(target.userID, (error, result) => error ? reject(error) : resolve(result)));
					const profile = info && info[target.userID];
					username = (profile && (profile.vanity || profile.username)) || username;
					display = (profile && (profile.name || profile.firstName)) || display;
				}
				catch (_) { /* name is optional */ }
			}

			const handle = username ? "@" + String(username).replace(/^@/, "") : null;
			const mention = handle || display || target.userID;
			if (!mention) continue;
			if (seen.has(mention)) continue;
			seen.add(mention);

			try {
				await message.send(fill(template, [mention, threadName || threadID]));
			}
			catch (error) {
				log.warn("LEAVE", `Could not announce ${mention}: ${error.message}`);
			}
		}
	}
};
