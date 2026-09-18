"use strict";

/**
 * platforms/instagram/events/normalizer.js
 *
 * Normalizes raw Instagram events from ICA (MQTT or SSE) into a consistent,
 * platform-neutral event object matching Floppa/GoatBot lifecycle expectations.
 */

function firstArray(...candidates) {
	for (const c of candidates) {
		if (Array.isArray(c) && c.length) return c;
	}
	return null;
}

function normalizeEvent(rawEvent, currentBotID = null) {
	if (!rawEvent || typeof rawEvent !== "object") return rawEvent;

	const event = Object.assign({}, rawEvent);
	const msg = (event.message && typeof event.message === "object") ? event.message : event;
	const botIDStr = currentBotID ? String(currentBotID) : null;

	// 1. Thread & Message identifiers
	const threadID = String(event.threadID || event.thread_id || event.threadId || event.thread_v2_id || msg.threadID || msg.thread_id || "");
	const senderID = String(event.senderID || event.sender_id || event.senderId || event.userID || event.user_id || msg.senderID || msg.sender_id || msg.senderId || msg.userID || msg.user_id || "");
	const messageID = event.messageID || event.item_id || event.message_id || event.messageId || msg.messageID || msg.item_id || msg.message_id || msg.messageId
		? String(event.messageID || event.item_id || event.message_id || event.messageId || msg.messageID || msg.item_id || msg.message_id || msg.messageId)
		: null;
	const timestamp = Number(event.timestamp || msg.timestamp) || Date.now();

	// 2. Identity & Group flags
	const isGroup = event.isGroup !== undefined ? Boolean(event.isGroup) : (threadID.includes(":") || (event.members && event.members.length > 2));
	const isSelf = Boolean(event.isSelf || (botIDStr && senderID && senderID === botIDStr));

	// 3. Attachments normalization
	let attachments = Array.isArray(event.attachments) ? event.attachments.map(att => {
		if (!att || typeof att !== "object") return att;
		const type = att.type === "image" ? "photo" : att.type === "gif" ? "animated_image" : att.type;
		return Object.assign({}, att, { type });
	}) : [];

	if (attachments.length === 0) {
		const m = event.media || event.visual_media?.media || event.raven_media?.media || event.clip?.clip || event.media_share || event.direct_story?.media || (event.raw && (event.raw.media || event.raw.visual_media?.media));
		const u = m?.image_versions2?.candidates?.[0]?.url
			|| m?.candidates?.[0]?.url
			|| event.image_versions2?.candidates?.[0]?.url
			|| (event.raw?.image_versions2?.candidates?.[0]?.url)
			|| event.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
			|| event.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
			|| m?.video_versions?.[0]?.url
			|| event.video_versions?.[0]?.url
			|| m?.url
			|| (typeof event.photo === "string" ? event.photo : event.photo?.url)
			|| (typeof event.image === "string" ? event.image : event.image?.url);
		if (u) {
			const isVid = (m?.media_type === 2 || m?.video_versions || event.video_versions);
			attachments.push({
				type: isVid ? "video" : "photo",
				url: u
			});
		}
	}

	// 4. Message Replies normalization
	let messageReply = null;
	const replied = event.messageReply || event.repliedMessage || event.replyToMessage || event.reply_to_message || event.replied_to_message || event.replied_to_item || event.reply_to_item || event.quoted_item || (event.raw && (event.raw.messageReply || event.raw.repliedMessage || event.raw.replyToMessage || event.raw.replied_to_message || event.raw.replied_to_item));

	if (replied && typeof replied === "object") {
		const replySender = replied.senderID || replied.sender_id || replied.userId || replied.user_id || replied.author;
		const replyMsgId = replied.messageID || replied.item_id || replied.message_id || replied.id || event.replyTo || event.reply_to_item_id || event.replied_to_item_id || event.replied_to_target_id;

		let replyAttachments = Array.isArray(replied.attachments) ? replied.attachments.map(att => {
			if (!att || typeof att !== "object") return att;
			const type = att.type === "image" ? "photo" : att.type === "gif" ? "animated_image" : att.type;
			return Object.assign({}, att, { type });
		}) : [];

		if (replyAttachments.length === 0) {
			const rm = replied.media || replied.visual_media?.media || replied.raven_media?.media || replied.clip?.clip || replied.media_share || replied.direct_story?.media;
			const ru = rm?.image_versions2?.candidates?.[0]?.url
				|| rm?.candidates?.[0]?.url
				|| replied.image_versions2?.candidates?.[0]?.url
				|| replied.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
				|| replied.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
				|| replied.reel_share?.media?.image_versions2?.candidates?.[0]?.url
				|| replied.story_share?.media?.image_versions2?.candidates?.[0]?.url
				|| rm?.video_versions?.[0]?.url
				|| replied.video_versions?.[0]?.url
				|| rm?.url
				|| (typeof replied.photo === "string" ? replied.photo : replied.photo?.url)
				|| (typeof replied.image === "string" ? replied.image : replied.image?.url);
			if (ru) {
				const isVid = (rm?.media_type === 2 || rm?.video_versions || replied.video_versions);
				replyAttachments.push({
					type: isVid ? "video" : "photo",
					url: ru
				});
			}
		}

		messageReply = {
			...replied,
			messageID: replyMsgId ? String(replyMsgId) : null,
			senderID: replySender ? String(replySender) : null,
			body: replied.body || replied.text || (typeof replied.caption === "string" ? replied.caption : replied.caption?.text) || "",
			attachments: replyAttachments,
			timestamp: replied.timestamp || null
		};
	} else if (event.replyTo || event.reply_to_item_id || event.replied_to_item_id || event.replied_to_target_id) {
		const replyId = String(event.replyTo || event.reply_to_item_id || event.replied_to_item_id || event.replied_to_target_id);
		messageReply = {
			messageID: replyId,
			senderID: null,
			body: "",
			attachments: [],
			timestamp: null
		};
	}

	let type = event.type || "message";
	if (messageReply && type === "message") {
		type = "message_reply";
	}

	// 5. Membership Events (Join / Leave)
	const added = firstArray(
		event.userIDs, event.addedParticipants, event.added_participants,
		event.added_users, event.added_user_ids, event.usersAdded, event.users_added
	);
	const removed = firstArray(
		event.removedParticipants, event.removed_participants,
		event.removed_users, event.removed_user_ids, event.left_users, event.usersRemoved
	);

	let userIDs = [];
	if (type === "join" || type === "gc_join" || type === "subscribe" || added) {
		userIDs = added ? added.map(String) : [];
		if (added) type = "join";
	} else if (type === "leave" || type === "gc_leave" || type === "unsubscribe" || removed) {
		userIDs = removed ? removed.map(String) : [];
		if (removed) type = "leave";
	}

	// 6. Reaction Events
	const reaction = event.reaction || (event.reaction && event.reaction.emoji) || "";
	const targetMessageID = event.targetMessageID || event.target_message_id || (event.reaction && event.reaction.item_id) || messageID;

	const resolvedBody = typeof event.body === "string" ? event.body : (typeof event.text === "string" ? event.text : (typeof msg.body === "string" ? msg.body : (typeof msg.text === "string" ? msg.text : (typeof event.caption === "string" ? event.caption : (event.caption?.text || event.media?.caption?.text || event.visual_media?.media?.caption?.text || "")))));

	return {
		threadID,
		senderID,
		userID: senderID,
		messageID,
		body: resolvedBody,
		timestamp,
		attachments,
		mentions: event.mentions && typeof event.mentions === "object" ? event.mentions : {},
		type,
		isGroup,
		isSelf,
		messageReply,
		repliedMessage: messageReply,
		replyToItemId: messageReply ? messageReply.messageID : (event.replyTo ? String(event.replyTo) : null),
		userIDs,
		reaction,
		targetMessageID: targetMessageID ? String(targetMessageID) : null,
		raw: event
	};
}

module.exports = { normalizeEvent };
