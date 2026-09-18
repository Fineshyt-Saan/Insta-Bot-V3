"use strict";

/**
 * onJoin — greet people who are added to a group thread.
 *
 * Configure in config.json:
 *   "welcome": {
 *     "enable": true,
 *     "message": "Welcome %1 to %2! 👋",   // %1 = user, %2 = thread name
 *     "selfMessage": "Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.",
 *     "threadIDs": []                        // empty = every thread
 *   }
 *
 * When the BOT ITSELF is the one added, it does not welcome itself: it thanks
 * the inviter with `selfMessage` ({prefix} is the live command prefix, %2 the
 * group name).
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
		name: "onJoin",
		category: "system",
		eventType: "join",
		description: { en: "Welcome members added to a group thread" }
	},

	onEvent: async function ({ api, event, message, config, threadsData }) {
		const settings = config.welcome || {};
		if (settings.enable === false) return;

		const threadID = event.threadID;
		if (Array.isArray(settings.threadIDs) && settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))) return;

		const thread = (threadsData && typeof threadsData.get === "function" ? threadsData.get(threadID) : null) || {};
		const isBotOff = thread.adminOnly === true || thread.settings?.adminOnly === true || thread.settings?.botOff === true;
		const isEventsOff = thread.eventsOff === true || thread.settings?.eventsOff === true || thread.settings?.welcome === false;
		if (isBotOff || isEventsOff) return;

		// Instagram's action_log carries the affected member as an @handle in
		// `usernames`; some payloads also carry numeric ids. Greet by USERNAME,
		// not the numeric id, so the welcome reads "@someone" rather than a long
		// number.
		//
		// `senderID`/`userID` in a membership event is the ACTOR (who added the
		// member), NOT the member — using it as a fallback greeted the actor as
		// well. Only `participantID`/`userIDs` name the affected member.
		const usernames = Array.isArray(event.usernames) ? event.usernames.map(String).filter(Boolean) : [];
		const ids = (event.userIDs && event.userIDs.length
			? event.userIDs
			: (event.participantID ? [event.participantID] : []))
			.filter(Boolean).map(String);

		if (!usernames.length && !ids.length) return;

		let threadName = thread.name;
		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) => error ? reject(error) : resolve(result)));
				threadName = info && (info.name || (info.threadName));
				if (threadName) threadsData.update(threadID, { name: threadName });
			}
			catch (_) { /* name is optional */ }
		}

		// The bot's own id, so an invite of the bot is not treated as a member to
		// welcome. The action_log often lists the bot here when IT was added.
		let selfID = null;
		try {
			selfID = String(api.getCurrentUserID() || api._userID || "") || null;
		}
		catch (_) { selfID = null; }
		const selfHandles = new Set();
		try {
			const info = selfID ? await new Promise((resolve) =>
				api.getUserInfo(selfID, (error, result) => resolve(error ? null : result))) : null;
			const self = info && info[selfID];
			if (self && (self.vanity || self.username)) selfHandles.add(String(self.vanity || self.username).toLowerCase());
		}
		catch (_) { /* best effort */ }

		const isSelf = (target) =>
			(selfID && target.userID && String(target.userID) === selfID) ||
			(target.username && selfHandles.has(String(target.username).replace(/^@/, "").toLowerCase()));

		// One entry per affected member: a known handle when we have one, else
		// the numeric id to be resolved to a username below.
		const targets = [];
		for (const name of usernames) targets.push({ username: name, userID: null });
		for (const id of ids) {
			if (targets.some(t => t.userID === id)) continue;
			// Skip an id whose username we already have from the same event only
			// when they are provably the same member; otherwise keep both and
			// dedupe after resolving.
			targets.push({ username: null, userID: id });
		}
		if (!targets.length) return;

		// If the bot itself was added, thank the inviter; do not welcome the bot.
		const selfTargets = targets.filter(isSelf);
		const memberTargets = targets.filter(t => !isSelf(t));
		if (selfTargets.length) {
			const selfTemplate = settings.selfMessage ||
				"Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.";
			const text = fill(selfTemplate, [null, threadName || threadID])
				.replace(/\{prefix\}/g, String(config.prefix == null ? "*" : config.prefix));
			try {
				await message.send(text);
			}
			catch (error) {
				log.warn("JOIN", `Could not thank the inviter: ${error.message}`);
			}
		}
		if (!memberTargets.length) return;

		const template = settings.message || "Welcome %1 to %2! 👋";
		const seen = new Set();

		for (const target of memberTargets) {
			let username = target.username;
			let display = null;

			// Resolve a numeric id to its username so the greet never shows an id.
			if (!username && target.userID) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(target.userID, (error, result) => error ? reject(error) : resolve(result)));
					const profile = info && info[target.userID];
					username = (profile && (profile.vanity || profile.username)) || null;
					display = profile && (profile.name || profile.firstName) || null;
				}
				catch (_) { /* fall back below */ }
			}

			// Prefer the username; keep the full name only as a last resort so a
			// lookup that returns nothing still greets a human rather than a number.
			const handle = username ? "@" + String(username).replace(/^@/, "") : null;
			const mention = handle || display || target.userID;
			if (!mention) continue;
			if (seen.has(mention)) continue;
			seen.add(mention);

			try {
				await message.send(fill(template, [mention, threadName || threadID]));
			}
			catch (error) {
				log.warn("JOIN", `Could not welcome ${mention}: ${error.message}`);
			}
		}
	}
};
