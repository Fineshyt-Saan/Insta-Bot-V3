"use strict";

/**
 * platforms/instagram/adapter/apiWrapper.js
 *
 * Exposes a standardized, platform-neutral API surface for GoatBot/Floppa commands
 * while wrapping native Instagram ICA calls under the hood.
 *
 * Features:
 * - Transparent node-style callbacks and Promise support.
 * - Automatic typing indicator option and media dispatch routing.
 * - Graceful fallbacks for unsupported Facebook-only methods to avoid bot crashes.
 */

const { dispatchMediaMessage } = require("../media/handler");
const logger = require("../../../utils/logger");

function createAPIWrapper(rawClient, config = {}) {
	const ig = rawClient;

	function wrapCallback(promise, callback) {
		if (typeof callback === "function") {
			promise.then(
				res => callback(null, res),
				err => callback(err, null)
			);
			return undefined;
		}
		return promise;
	}

	function isLikelyMedia(val) {
		if (!val) return false;
		if (Buffer.isBuffer(val) || (val && val.buffer && Buffer.isBuffer(val.buffer))) return true;
		if (typeof val === "object" && (val.path || val.url || val.stream || typeof val.pipe === "function")) return true;
		if (typeof val === "string") {
			if (/^https?:\/\//i.test(val)) return true;
			if (val.includes("/") || val.includes("\\") || /\.(jpe?g|png|webp|gif|bmp|mp4|mov|webm|mp3|wav|ogg|m4a)(\?|$)/i.test(val)) return true;
		}
		return false;
	}

	function normalizeMediaCall(a, b, c, d) {
		let threadID, pathOrUrl, opts = {}, callback;
		if (isLikelyMedia(a) && !isLikelyMedia(b)) {
			pathOrUrl = a;
			threadID = String(b);
			if (typeof c === "function") {
				callback = c;
				opts = typeof d === "object" && d !== null ? d : { replyToMessageID: d };
			} else {
				callback = typeof d === "function" ? d : undefined;
				opts = typeof c === "object" && c !== null ? c : { caption: typeof c === "string" ? c : "", replyToMessageID: d };
			}
		} else {
			threadID = String(a);
			pathOrUrl = b;
			if (typeof c === "function") {
				callback = c;
				opts = {};
			} else if (typeof c === "object" && c !== null) {
				opts = c;
				callback = typeof d === "function" ? d : undefined;
			} else if (typeof c === "string") {
				opts = { caption: c, replyToMessageID: d };
				callback = typeof d === "function" ? d : undefined;
			} else {
				callback = typeof d === "function" ? d : undefined;
			}
		}
		return { threadID, pathOrUrl, opts, callback };
	}

	const wrapper = {
		_raw: ig,

		getCurrentUserID: () => {
			if (!ig) return null;
			if (typeof ig.getCurrentUserID === "function") {
				const id = ig.getCurrentUserID();
				return typeof id === "object" ? (id?.userID || id?.userId || String(id)) : String(id);
			}
			return ig._userID || null;
		},

		sendMessage: async (form, threadID, arg3, arg4) => {
			let callback;
			let replyToMessageID;

			if (typeof threadID === "function") {
				callback = threadID;
				threadID = null;
			}
			if (typeof arg3 === "function") {
				callback = arg3;
				replyToMessageID = arg4;
			} else if (typeof arg3 === "string" || typeof arg3 === "number") {
				replyToMessageID = String(arg3);
				if (typeof arg4 === "function") callback = arg4;
			} else if (arg3 && typeof arg3 === "object") {
				if (arg3.replyToMessageID || arg3.replyTo) {
					replyToMessageID = String(arg3.replyToMessageID || arg3.replyTo);
				}
				if (typeof arg4 === "function") callback = arg4;
			} else if (typeof arg4 === "function") {
				callback = arg4;
			} else if (arg4) {
				replyToMessageID = String(arg4);
			}

			if (!threadID && form && typeof form === "object") {
				threadID = form.threadID || form.threadId;
			}

			const promise = (async () => {
				if (config.TYPING_INDICATOR && threadID && ig && typeof ig.sendTypingIndicator === "function") {
					ig.sendTypingIndicator(threadID).catch(() => {});
				}

				const hasMedia = form && typeof form === "object" && Boolean(
					form.attachment || form.attachments || form.photo || form.image || form.video || form.audio || form.voice
				);

				if (hasMedia) {
					return await dispatchMediaMessage(wrapper, threadID, form, replyToMessageID);
				}

				const payload = (form && typeof form === "object") ? form : String(form || "");
				if (replyToMessageID && ig && typeof ig.replyToMessage === "function") {
					try {
						const textToSend = typeof payload === "object" && payload !== null ? (payload.body != null ? payload.body : payload) : payload;
						return await ig.replyToMessage(threadID, textToSend, replyToMessageID);
					} catch (_) {}
				}

				if (ig) {
					if (typeof ig.sendMessage === "function") {
						if (replyToMessageID) {
							try {
								return await new Promise((resolve, reject) => {
									ig.sendMessage(payload, threadID, (err, res) => err ? reject(err) : resolve(res), replyToMessageID);
								});
							} catch (replyErr) {
								logger.warn(`Failed to send reply to message ${replyToMessageID}, falling back to plain send:`, replyErr?.message || replyErr);
								try {
									return await new Promise((resolve, reject) => {
										ig.sendMessage(payload, threadID, (err, res) => err ? reject(err) : resolve(res));
									});
								} catch (plainErr) {
									if (typeof payload === "object" && payload !== null && payload.body != null) {
										return await new Promise((resolve, reject) => {
											ig.sendMessage(String(payload.body), threadID, (err, res) => err ? reject(err) : resolve(res));
										});
									}
									throw plainErr;
								}
							}
						}
						try {
							return await new Promise((resolve, reject) => {
								ig.sendMessage(payload, threadID, (err, res) => err ? reject(err) : resolve(res));
							});
						} catch (sendErr) {
							if (typeof payload === "object" && payload !== null && payload.body != null) {
								logger.warn("Failed to send rich payload, falling back to plain text:", sendErr?.message || sendErr);
								return await new Promise((resolve, reject) => {
									ig.sendMessage(String(payload.body), threadID, (err, res) => err ? reject(err) : resolve(res));
								});
							}
							throw sendErr;
						}
					}
					if (ig.sendMessage && typeof ig.sendMessage.toThread === "function") {
						return await ig.sendMessage.toThread(threadID, replyToMessageID ? { body: typeof payload === "object" ? payload.body : payload, replyTo: replyToMessageID } : payload);
					}
					if (typeof ig.sendDirectMessage === "function") {
						return await ig.sendDirectMessage(threadID, typeof payload === "object" ? payload.body : payload);
					}
				}
				return { messageID: "mock_" + Date.now() };
			})();

			return wrapCallback(promise, callback);
		},

		replyToMessage: async (threadID, message, replyToMessageID, callback) => {
			const promise = (async () => {
				const text = typeof message === "object" && message !== null ? (message.body != null ? String(message.body) : "") : String(message || "");
				if (ig && typeof ig.replyToMessage === "function") {
					try {
						return await ig.replyToMessage(threadID, text, replyToMessageID);
					} catch (_) {}
				}
				return await wrapper.sendMessage(message, threadID, undefined, replyToMessageID);
			})();
			return wrapCallback(promise, callback);
		},

		sendPhoto: async (arg1, arg2, arg3, arg4) => {
			const { threadID, pathOrUrl, opts, callback } = normalizeMediaCall(arg1, arg2, arg3, arg4);
			const promise = (async () => {
				const replyTo = opts.replyToMessageID || opts.replyTo;
				if (ig && typeof ig.sendPhoto === "function") {
					try {
						return await ig.sendPhoto(threadID, pathOrUrl, opts);
					} catch (err) {
						if (replyTo) {
							const fallbackOpts = Object.assign({}, opts, { replyToMessageID: undefined, replyTo: undefined });
							return await ig.sendPhoto(threadID, pathOrUrl, fallbackOpts);
						}
						throw err;
					}
				}
				if (ig && typeof ig.sendImage === "function") {
					if (replyTo) {
						try {
							return await ig.sendImage(pathOrUrl, threadID, opts.caption || "", undefined, replyTo);
						} catch (_) {
							return await ig.sendImage(pathOrUrl, threadID, opts.caption || "");
						}
					}
					return await ig.sendImage(pathOrUrl, threadID, opts.caption || "");
				}
				return await wrapper.sendMessage({ body: opts.caption || "", attachment: pathOrUrl, replyTo }, threadID, undefined, replyTo);
			})();
			return wrapCallback(promise, callback);
		},

		sendImage: async (source, threadID, caption = "", callback, replyToMessageID) => {
			if (typeof caption === "function") {
				callback = caption;
				caption = "";
			}
			return wrapper.sendPhoto(threadID, source, { caption, replyToMessageID }, callback);
		},

		sendVideo: async (arg1, arg2, arg3, arg4) => {
			const { threadID, pathOrUrl, opts, callback } = normalizeMediaCall(arg1, arg2, arg3, arg4);
			const promise = (async () => {
				const replyTo = opts.replyToMessageID || opts.replyTo;
				if (ig && typeof ig.sendVideo === "function") {
					if (ig.sendVideoFromUrl || ig.sendMedia) {
						if (replyTo) {
							try {
								return await ig.sendVideo(threadID, pathOrUrl, opts, undefined, replyTo);
							} catch (_) {
								const fallbackOpts = Object.assign({}, opts, { replyToMessageID: undefined, replyTo: undefined });
								return await ig.sendVideo(threadID, pathOrUrl, fallbackOpts);
							}
						}
						return await ig.sendVideo(threadID, pathOrUrl, opts);
					} else {
						return await new Promise((resolve, reject) => {
							const cb = (err, res) => err ? reject(err) : resolve(res);
							if (replyTo) {
								ig.sendVideo(pathOrUrl, threadID, cb, replyTo);
							} else {
								ig.sendVideo(pathOrUrl, threadID, cb);
							}
						});
					}
				}
				return await wrapper.sendMessage({ body: opts.caption || "", attachment: pathOrUrl, replyTo }, threadID, undefined, replyTo);
			})();
			return wrapCallback(promise, callback);
		},

		sendVoice: async (arg1, arg2, arg3, arg4) => {
			const { threadID, pathOrUrl, opts, callback } = normalizeMediaCall(arg1, arg2, arg3, arg4);
			const promise = (async () => {
				const replyTo = opts.replyToMessageID || opts.replyTo;
				if (ig && typeof ig.sendVoice === "function") {
					try {
						return await ig.sendVoice(threadID, pathOrUrl, opts);
					} catch (err) {
						if (replyTo) {
							const fallbackOpts = Object.assign({}, opts, { replyToMessageID: undefined, replyTo: undefined });
							return await ig.sendVoice(threadID, pathOrUrl, fallbackOpts);
						}
						throw err;
					}
				}
				if (ig && typeof ig.sendAudio === "function") {
					return await new Promise((resolve, reject) => {
						const cb = (err, res) => err ? reject(err) : resolve(res);
						if (replyTo) {
							try {
								ig.sendAudio(pathOrUrl, threadID, cb, replyTo);
							} catch (_) {
								ig.sendAudio(pathOrUrl, threadID, cb);
							}
						} else {
							ig.sendAudio(pathOrUrl, threadID, cb);
						}
					});
				}
				return await wrapper.sendMessage({ attachment: pathOrUrl, replyTo }, threadID, undefined, replyTo);
			})();
			return wrapCallback(promise, callback);
		},

		sendAudio: async (source, threadID, callback, replyToMessageID) => {
			return wrapper.sendVoice(threadID, source, { replyToMessageID }, callback);
		},

		sendGIF: async (threadID, url, opts = {}, callback) => {
			if (typeof opts === "function") {
				callback = opts;
				opts = {};
			}
			const promise = (async () => {
				if (ig && typeof ig.sendGIF === "function") {
					return await ig.sendGIF(threadID, url, opts);
				}
				return await wrapper.sendMessage({ attachment: url }, threadID);
			})();
			return wrapCallback(promise, callback);
		},

		sendReaction: async (reaction, messageID, threadID, callback) => {
			if (typeof threadID === "function") {
				callback = threadID;
				threadID = undefined;
			}
			const promise = (async () => {
				if (ig && typeof ig.setMessageReaction === "function") {
					return await ig.setMessageReaction(reaction || "", messageID, threadID);
				}
				if (ig && typeof ig.sendReaction === "function") {
					return await ig.sendReaction(reaction || "", messageID, threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		setMessageReaction: (reaction, messageID, threadIDOrCallback, callbackOrForce, maybeForce) => {
			let threadID = undefined;
			let callback = undefined;
			if (typeof threadIDOrCallback === "function") {
				callback = threadIDOrCallback;
			} else {
				threadID = threadIDOrCallback;
				if (typeof callbackOrForce === "function") {
					callback = callbackOrForce;
				}
			}
			return wrapper.sendReaction(reaction, messageID, threadID, callback);
		},

		unsendMessage: async (messageID, threadIDOrCallback, maybeCallback) => {
			let threadID = undefined;
			let callback = undefined;
			if (typeof threadIDOrCallback === "function") {
				callback = threadIDOrCallback;
			} else {
				threadID = threadIDOrCallback;
				if (typeof maybeCallback === "function") callback = maybeCallback;
			}
			const promise = (async () => {
				if (ig && typeof ig.unsendMessage === "function") {
					return await ig.unsendMessage(messageID, threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		getUserInfo: async (userID, callback) => {
			const promise = (async () => {
				if (!userID) return {};
				if (ig && typeof ig.getUserInfo === "function") {
					const res = await ig.getUserInfo(userID);
					if (res && typeof res === "object") {
						const uid = String(res.userID || res.userId || res.id || userID);
						return { [uid]: res, ...res };
					}
					return res || {};
				}
				return {};
			})();
			return wrapCallback(promise, callback);
		},

		getUserInfoByUsername: async (username, callback) => {
			const promise = (async () => {
				if (!username) return null;
				if (ig && typeof ig.getUserInfoByUsername === "function") {
					return await ig.getUserInfoByUsername(username);
				}
				return null;
			})();
			return wrapCallback(promise, callback);
		},

		getThreadInfo: async (threadID, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.getThreadInfo === "function") {
					return await ig.getThreadInfo(threadID);
				}
				return null;
			})();
			return wrapCallback(promise, callback);
		},

		getThread: (threadID, callback) => wrapper.getThreadInfo(threadID, callback),

		getThreadList: async (opts, callback) => {
			if (typeof opts === "function") {
				callback = opts;
				opts = {};
			}
			const promise = (async () => {
				if (ig && typeof ig.getThreadList === "function") {
					return await ig.getThreadList(opts);
				}
				if (ig && typeof ig.getInbox === "function") {
					return await ig.getInbox(opts);
				}
				return [];
			})();
			return wrapCallback(promise, callback);
		},

		getInbox: (opts, callback) => wrapper.getThreadList(opts, callback),

		getThreadHistory: async (threadID, amount = 20, timestamp = null, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.getThreadHistory === "function") {
					return await ig.getThreadHistory(threadID, amount, timestamp);
				}
				return [];
			})();
			return wrapCallback(promise, callback);
		},

		markAsRead: async (threadID, read = true, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.markAsRead === "function") {
					return await ig.markAsRead(threadID, read);
				}
				return { success: true };
			})();
			return wrapCallback(promise, callback);
		},

		markAsSeen: (threadID, callback) => wrapper.markAsRead(threadID, true, callback),

		sendTypingIndicator: (threadID, callback) => {
			if (ig && typeof ig.sendTypingIndicator === "function") {
				return ig.sendTypingIndicator(threadID, callback);
			}
			if (typeof callback === "function") callback(null, () => {});
			return () => {};
		},

		stopTypingIndicator: (threadID, callback) => {
			if (ig && typeof ig.stopTypingIndicator === "function") {
				return ig.stopTypingIndicator(threadID, callback);
			}
			if (typeof callback === "function") callback(null);
			return Promise.resolve();
		},

		sendTextEffect: async (text, threadID, effect, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.sendTextEffect === "function") {
					return await ig.sendTextEffect(text, threadID, effect);
				}
				return await wrapper.sendMessage(text, threadID);
			})();
			return wrapCallback(promise, callback);
		},

		sendAvatarTextEffect: async (text, threadID, effect, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.sendAvatarTextEffect === "function") {
					return await ig.sendAvatarTextEffect(text, threadID, effect);
				}
				return await wrapper.sendMessage(text, threadID);
			})();
			return wrapCallback(promise, callback);
		},

		sendMusic: async (threadID, track, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.sendMusic === "function") {
					return await ig.sendMusic(threadID, track);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		musicSearch: async (query, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.musicSearch === "function") {
					return await ig.musicSearch(query);
				}
				return [];
			})();
			return wrapCallback(promise, callback);
		},

		addUserToGroup: async (userIDs, threadID, callback) => {
			const list = Array.isArray(userIDs) ? userIDs : [userIDs];
			const promise = (async () => {
				if (ig && typeof ig.addUserToGroup === "function") {
					return await ig.addUserToGroup(list, threadID);
				}
				if (ig && typeof ig.addUserToThread === "function") {
					return await ig.addUserToThread(list, threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		addUserToThread: (userIDs, threadID, callback) => wrapper.addUserToGroup(userIDs, threadID, callback),

		removeUserFromGroup: async (userID, threadID, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.removeUserFromGroup === "function") {
					return await ig.removeUserFromGroup(userID, threadID);
				}
				if (ig && typeof ig.removeUserFromThread === "function") {
					return await ig.removeUserFromThread(userID, threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		removeUserFromThread: (userID, threadID, callback) => wrapper.removeUserFromGroup(userID, threadID, callback),

		leaveGroup: async (threadID, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.leaveGroup === "function") {
					return await ig.leaveGroup(threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		changeThreadTitle: async (threadID, title, callback) => {
			const promise = (async () => {
				if (ig && typeof ig.changeThreadTitle === "function") {
					return await ig.changeThreadTitle(threadID, title);
				}
				if (ig && typeof ig.setTitle === "function") {
					return await ig.setTitle(title, threadID);
				}
				return { success: false, unsupported: true };
			})();
			return wrapCallback(promise, callback);
		},

		setTitle: (title, threadID, callback) => wrapper.changeThreadTitle(threadID, title, callback),

		// ── Graceful Fallbacks for Facebook-Specific Methods ──
		changeThreadColor: async (color, threadID, callback) => {
			const result = { success: false, unsupported: true, message: "Thread themes/colors are not supported on Instagram Direct." };
			return wrapCallback(Promise.resolve(result), callback);
		},

		changeNickname: async (nickname, threadID, userID, callback) => {
			const result = { success: false, unsupported: true, message: "Thread nicknames are not supported on Instagram Direct." };
			return wrapCallback(Promise.resolve(result), callback);
		},

		addFriend: async (userID, callback) => {
			const result = { success: false, unsupported: true, message: "Friend requests are a Facebook-only feature." };
			return wrapCallback(Promise.resolve(result), callback);
		},

		removeFriend: async (userID, callback) => {
			const result = { success: false, unsupported: true, message: "Friends list is a Facebook-only feature." };
			return wrapCallback(Promise.resolve(result), callback);
		},

		changeAdminStatus: async (threadID, userID, isAdmin, callback) => {
			const result = { success: false, unsupported: true, message: "Changing admin status is unsupported on Instagram Direct." };
			return wrapCallback(Promise.resolve(result), callback);
		},

		listen: (callback) => {
			if (ig && typeof ig.listen === "function") {
				return ig.listen(callback);
			}
			if (ig && typeof ig.listenMqtt === "function") {
				return ig.listenMqtt(callback);
			}
			throw new Error("Underlying ICA listener not available");
		},

		listenMqtt: (callback) => wrapper.listen(callback),

		stopListening: () => {
			if (ig && typeof ig.stopListening === "function") {
				return ig.stopListening();
			}
		}
	};

	return new Proxy(wrapper, {
		get(target, prop, receiver) {
			if (prop in target) return target[prop];
			if (ig && prop in ig) {
				const val = ig[prop];
				return typeof val === "function" ? val.bind(ig) : val;
			}
			return undefined;
		}
	});
}

module.exports = { createAPIWrapper };
