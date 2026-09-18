"use strict";

/**
 * platforms/instagram/adapter/messageContext.js
 *
 * Creates the standard `message` helper object handed to commands during invocation.
 * Provides intuitive shortcuts for:
 *   message.send(form, callback)
 *   message.reply(form, callback)
 *   message.unsend(messageID, callback)
 *   message.react(emoji, messageID, callback)
 *   message.effect(text, effect, callback)
 *   message.avatarEffect(text, effect, callback)
 *   message.music(track, callback)
 *   message.musicSearch(query, callback)
 *   message.typing()
 *   message.SyntaxError(customGuide)
 */

function createMessageContext(apiOrOpts, maybeEvent = {}, maybeOpts = {}) {
	let api, event, command, prefix;
	if (apiOrOpts && typeof apiOrOpts === "object" && apiOrOpts.api && apiOrOpts.event) {
		api = apiOrOpts.api;
		event = apiOrOpts.event;
		command = apiOrOpts.command || null;
		prefix = apiOrOpts.prefix || "*";
	} else {
		api = apiOrOpts;
		event = maybeEvent || {};
		command = maybeOpts.command || null;
		prefix = maybeOpts.prefix || "*";
	}

	const threadID = event.threadID;
	const eventMessageID = event.messageID;

	function wrap(promise, callback) {
		if (typeof callback === "function") {
			promise.then(
				res => callback(null, res),
				err => callback(err, null)
			);
			return undefined;
		}
		return promise;
	}

	const context = {
		threadID,
		event,
		messageReply: event.messageReply || event.repliedMessage || null,
		replyTo: event.messageReply || event.repliedMessage || event.replyTo || null,
		repliedMessage: event.repliedMessage || event.messageReply || null,

		send(form, callback) {
			const payload = typeof form === "string" ? { body: form } : form;
			return wrap(api.sendMessage(payload, threadID), callback);
		},

		reply(form, callback) {
			const payload = typeof form === "string" ? { body: form } : form;
			return wrap(api.sendMessage(payload, threadID, undefined, eventMessageID), callback);
		},

		unsend(messageID = eventMessageID, callback) {
			return wrap(api.unsendMessage(messageID, threadID), callback);
		},

		react(emoji, messageID = eventMessageID, callback) {
			return wrap(api.sendReaction(emoji == null ? "" : emoji, messageID, threadID), callback);
		},

		reaction(emoji, messageID = eventMessageID, callback) {
			return this.react(emoji, messageID, callback);
		},

		effect(text, effect, callback) {
			return wrap(api.sendTextEffect(text, threadID, effect), callback);
		},

		avatarEffect(text, effect, callback) {
			return wrap(api.sendAvatarTextEffect(text, threadID, effect), callback);
		},

		music(track, callback) {
			return wrap(api.sendMusic(threadID, track), callback);
		},

		musicSearch(query, callback) {
			return wrap(api.musicSearch(query), callback);
		},

		typing() {
			return api.sendTypingIndicator(threadID);
		},

		async SyntaxError(customGuide) {
			context._syntaxErrorCalled = true;
			const cmdConfig = command ? (command.config || command.meta || {}) : {};
			const cmdName = cmdConfig.name || "command";

			let guide = "";
			if (typeof customGuide === "string" && customGuide.trim()) {
				guide = customGuide.trim();
			} else if (cmdConfig.guide) {
				const g = cmdConfig.guide;
				guide = typeof g === "object" ? (g.en || g.vi || Object.values(g)[0] || "") : String(g);
			} else if (cmdConfig.usage) {
				guide = cmdConfig.usage;
			}

			guide = guide
				.replace(/{pn}/g, `${prefix}${cmdName}`)
				.replace(/{p}{n}/g, `${prefix}${cmdName}`)
				.replace(/{prefix}{name}/g, `${prefix}${cmdName}`)
				.replace(/{p}/g, prefix)
				.replace(/{prefix}/g, prefix)
				.replace(/{n}/g, cmdName)
				.replace(/{name}/g, cmdName);

			const msg = `⚠️ Syntax Error!\n\n📌 Command: ${cmdName}\n💡 Usage:\n${guide || `${prefix}${cmdName}`}`;
			return context.reply(msg);
		}
	};

	return context;
}

module.exports = { createMessageContext };
