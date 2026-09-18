"use strict";

/**
 * platforms/instagram/media/handler.js
 *
 * Media processing pipeline for Instagram Direct:
 * - Detects media types (photo, video, audio, gif).
 * - Downloads remote URLs to temporary files.
 * - Converts streams / Buffers to temporary files if required.
 * - Handles Instagram-specific broadcasting rules (separate text captions for videos/audio).
 * - Cleans up temporary files safely.
 */

const fs = require("fs-extra");
const path = require("path");
const { Readable } = require("stream");
const utils = require("../../../utils.js");
const logger = require("../../../utils/logger");

function isReadableStream(obj) {
	return obj instanceof Readable ||
		(obj && typeof obj === "object" && typeof obj.pipe === "function" && typeof obj.on === "function");
}

function detectMediaKind(source) {
	if (!source) return "photo";
	let str = "";
	if (typeof source === "string") {
		str = source.toLowerCase();
	} else if (typeof source === "object") {
		const type = (source.type || source.kind || "").toLowerCase();
		if (type === "video" || type === "audio" || type === "photo" || type === "image" || type === "gif") {
			return type === "image" ? "photo" : type;
		}
		str = (source.path || source.filename || source.fileName || source.name || source.url || source.mimeType || source.contentType || "").toLowerCase();
	}

	if (/\.(mp4|mov|mkv|webm|avi|m4v)(\?.*)?$/i.test(str) || str.startsWith("video/") || /mime_type=video/i.test(str)) {
		return "video";
	}
	if (/\.(mp3|wav|m4a|ogg|aac|opus|flac)(\?.*)?$/i.test(str) || str.startsWith("audio/") || /mime_type=audio/i.test(str)) {
		return "audio";
	}
	if (/\.gif(\?.*)?$/i.test(str) || str === "image/gif") {
		return "gif";
	}
	return "photo";
}

async function prepareMediaSource(rawItem, tempFiles) {
	let item = rawItem;
	if (item && typeof item === "object" && !isReadableStream(item) && !Buffer.isBuffer(item)) {
		item = item.url || item.path || item.photo || item.video || item.audio || item.voice || item.image || item.stream || item.buffer || item;
	}

	const kind = detectMediaKind(rawItem);

	// 1. URL string
	if (typeof item === "string" && /^https?:\/\//i.test(item)) {
		let ext = utils.getExtFromUrl(item);
		if (!ext || ext === "bin") {
			if (kind === "video") ext = "mp4";
			else if (kind === "audio") ext = "mp3";
			else if (kind === "gif") ext = "gif";
			else ext = "jpg";
		}
		const tempPath = path.join(process.cwd(), "temp", `media_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);
		await fs.ensureDir(path.dirname(tempPath));

		try {
			const stream = await utils.getStreamFromURL(item);
			const writer = fs.createWriteStream(tempPath);
			stream.pipe(writer);
			await new Promise((resolve, reject) => {
				writer.on("finish", resolve);
				writer.on("error", reject);
			});
			tempFiles.push(tempPath);
			return tempPath;
		} catch (err) {
			logger.error("Failed to download media URL", { url: item, error: err.message });
			throw err;
		}
	}

	// 2. Buffer or Stream
	if (Buffer.isBuffer(item) || isReadableStream(item)) {
		let ext = ".jpg";
		if (rawItem && typeof rawItem === "object") {
			const candidateName = rawItem.filename || rawItem.fileName || rawItem.name || rawItem.path;
			if (candidateName) ext = path.extname(candidateName) || ext;
			else if (rawItem.contentType || rawItem.mimeType) {
				const fromMime = utils.getExtFromMimeType(rawItem.contentType || rawItem.mimeType);
				if (fromMime) ext = `.${fromMime}`;
			} else if (kind === "video") {
				ext = ".mp4";
			} else if (kind === "audio") {
				ext = ".mp3";
			} else if (kind === "gif") {
				ext = ".gif";
			}
		} else if (kind === "video") {
			ext = ".mp4";
		} else if (kind === "audio") {
			ext = ".mp3";
		}

		const tempPath = path.join(process.cwd(), "temp", `media_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
		await fs.ensureDir(path.dirname(tempPath));

		if (Buffer.isBuffer(item)) {
			await fs.writeFile(tempPath, item);
		} else {
			const writer = fs.createWriteStream(tempPath);
			item.pipe(writer);
			await new Promise((resolve, reject) => {
				writer.on("finish", resolve);
				writer.on("error", reject);
			});
		}
		tempFiles.push(tempPath);
		return tempPath;
	}

	// 3. Local existing file
	if (typeof item === "string" && fs.existsSync(item)) {
		return item;
	}

	return item;
}

/**
 * Dispatches a message form containing text and/or media attachments to Instagram.
 */
async function dispatchMediaMessage(apiOrForm, threadID, maybeFormOrApi, replyToMessageID = null) {
	let api, form;
	if (apiOrForm && typeof apiOrForm === "object" && (apiOrForm.body !== undefined || apiOrForm.attachment || apiOrForm.attachments || apiOrForm.photo || apiOrForm.image || apiOrForm.video || apiOrForm.audio || apiOrForm.voice)) {
		form = apiOrForm;
		api = maybeFormOrApi;
	} else {
		api = apiOrForm;
		form = maybeFormOrApi;
	}

	const bodyText = typeof form === "object" && form !== null ? (form.body != null ? String(form.body) : "") : String(form || "");
	const rawAttachments = form && typeof form === "object"
		? (form.attachment || form.attachments || form.photo || form.image || form.video || form.audio || form.voice || null)
		: null;

	const sources = (Array.isArray(rawAttachments) ? rawAttachments : [rawAttachments]).filter(Boolean);

	// Plain text dispatch
	if (!sources.length) {
		if (replyToMessageID && typeof api.replyToMessage === "function") {
			try {
				return await api.replyToMessage(threadID, bodyText, replyToMessageID);
			} catch (_) {
				return await api.sendMessage(bodyText, threadID, undefined, replyToMessageID);
			}
		}
		return await api.sendMessage(bodyText, threadID, undefined, replyToMessageID);
	}

	const tempFiles = [];
	let primaryResult = null;

	try {
		// Instagram Video & Voice notes do not support inline text captions.
		// If a body caption is present and there are video/voice media items, send the text first.
		const hasVideoOrAudio = sources.some(s => {
			const kind = detectMediaKind(s);
			return kind === "video" || kind === "audio";
		});

		if (bodyText && hasVideoOrAudio) {
			try {
				if (replyToMessageID && typeof api.replyToMessage === "function") {
					await api.replyToMessage(threadID, bodyText, replyToMessageID);
				} else {
					await api.sendMessage(bodyText, threadID, undefined, replyToMessageID);
				}
			} catch (err) {
				logger.warn("Failed to send text preamble before media", { error: err.message });
			}
		}

		for (let i = 0; i < sources.length; i++) {
			const rawSource = sources[i];
			const kind = detectMediaKind(rawSource);
			const filePath = await prepareMediaSource(rawSource, tempFiles);
			const isFirst = i === 0;
			const caption = (!hasVideoOrAudio && isFirst && bodyText) ? bodyText : "";
			const replyTarget = isFirst ? replyToMessageID : undefined;

			let res;
			try {
				if (kind === "video") {
					if (typeof api.sendVideo === "function") {
						res = await api.sendVideo(threadID, filePath, { caption, replyToMessageID: replyTarget }, undefined, replyTarget);
					} else if (typeof api.sendPhoto === "function") {
						res = await api.sendPhoto(threadID, filePath, { caption, replyToMessageID: replyTarget });
					}
				} else if (kind === "audio") {
					if (typeof api.sendVoice === "function") {
						res = await api.sendVoice(threadID, filePath, { replyToMessageID: replyTarget });
					} else if (typeof api.sendAudio === "function") {
						res = await api.sendAudio(filePath, threadID, undefined, replyTarget);
					}
				} else {
					if (typeof api.sendPhoto === "function") {
						res = await api.sendPhoto(threadID, filePath, { caption, replyToMessageID: replyTarget });
					} else if (typeof api.sendImage === "function") {
						res = await api.sendImage(filePath, threadID, caption, undefined, replyTarget);
					} else {
						res = await api.sendMessage({ body: caption, attachment: filePath, replyTo: replyTarget }, threadID, undefined, replyTarget);
					}
				}
			} catch (err) {
				if (replyTarget) {
					try {
						if (kind === "video") {
							if (typeof api.sendVideo === "function") {
								res = await api.sendVideo(threadID, filePath, { caption });
							} else if (typeof api.sendPhoto === "function") {
								res = await api.sendPhoto(threadID, filePath, { caption });
							}
						} else if (kind === "audio") {
							if (typeof api.sendVoice === "function") {
								res = await api.sendVoice(threadID, filePath);
							} else if (typeof api.sendAudio === "function") {
								res = await api.sendAudio(filePath, threadID);
							}
						} else {
							if (typeof api.sendPhoto === "function") {
								res = await api.sendPhoto(threadID, filePath, { caption });
							} else if (typeof api.sendImage === "function") {
								res = await api.sendImage(filePath, threadID, caption);
							} else {
								res = await api.sendMessage({ body: caption, attachment: filePath }, threadID);
							}
						}
					} catch (retryErr) {
						logger.warn("Failed to dispatch media item on fallback without reply", { kind, error: retryErr.message });
						if (hasVideoOrAudio && bodyText) {
							return primaryResult || { threadID, messageID: "preamble_sent" };
						}
						throw retryErr;
					}
				} else {
					logger.warn("Failed to dispatch media item", { kind, error: err.message });
					if (hasVideoOrAudio && bodyText) {
						return primaryResult || { threadID, messageID: "preamble_sent" };
					}
					throw err;
				}
			}

			if (isFirst) primaryResult = res;
		}

		return primaryResult;
	} finally {
		for (const f of tempFiles) {
			fs.remove(f).catch(() => {});
		}
	}
}

module.exports = {
	detectMediaKind,
	prepareMediaSource,
	dispatchMediaMessage,
	handleOutgoingMedia: dispatchMediaMessage
};
