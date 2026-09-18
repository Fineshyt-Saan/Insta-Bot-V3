"use strict";

/**
 * Shared helpers for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const MIME_EXT = {
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/aac": "aac",
	"audio/ogg": "ogg",
	"audio/wav": "wav"
};

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi"];
const AUDIO_EXT = ["mp3", "m4a", "aac", "ogg", "wav", "opus"];

function getType(value) {
	return Object.prototype.toString.call(value).slice(8, -1);
}

function isStream(value) {
	return Boolean(value) && typeof value === "object" && (value._readableState !== undefined || typeof value.pipe === "function");
}

function isBuffer(value) {
	return Buffer.isBuffer(value) || getType(value) === "Uint8Array";
}

function isUrl(value) {
	return typeof value === "string" && /^https?:\/\//i.test(value);
}

function extensionOf(source) {
	if (source == null) return "";
	if (typeof source === "string") {
		const clean = source.split("?")[0].split("#")[0];
		const dot = clean.lastIndexOf(".");
		return dot > -1 ? clean.slice(dot + 1).toLowerCase() : "";
	}
	return extensionOf(source.path || source.fileName || source.name || "");
}

/**
 * Classify a media source as "image", "video" or "audio".
 * Looks at MIME type first, then the file extension, defaulting to image.
 */
function mediaKind(source) {
	if (source == null) return "image";
	if (typeof source === "object") {
		const type = source.type || source.kind || "";
		if (type === "video" || type === "audio" || type === "image") return type;
		const mime = source.mimetype || source.mimeType || "";
		if (/^video\//i.test(mime)) return "video";
		if (/^audio\//i.test(mime)) return "audio";
		if (/^image\//i.test(mime)) return "image";
	}
	const ext = extensionOf(source);
	if (VIDEO_EXT.includes(ext)) return "video";
	if (AUDIO_EXT.includes(ext)) return "audio";
	if (IMAGE_EXT.includes(ext)) return "image";

	const str = typeof source === "string" ? source : (source && (source.url || source.path || source.fileName || source.name) ? String(source.url || source.path || source.fileName || source.name) : "");
	if (str) {
		if (/\.(mp4|m4v|mov|webm|mkv|avi|flv)(\?|#|$)/i.test(str) || /video[_\-\/]|mime_type=video/i.test(str) || /googlevideo\.com|tiktokcdn.*video/i.test(str)) return "video";
		if (/\.(mp3|m4a|wav|ogg|aac|flac|opus)(\?|#|$)/i.test(str) || /audio[_\-\/]|mime_type=audio|voice_media/i.test(str)) return "audio";
	}

	return "image";
}

/**
 * Turn any supported source (URL/path/Buffer/stream/{url|path|buffer|stream})
 * into a value ig-chat-api's media senders accept directly.
 */
function toSource(value) {
	if (value == null) return value;
	if (isUrl(value) || typeof value === "string" || isBuffer(value) || isStream(value)) return value;
	if (typeof value === "object") {
		if (value.url) return value.url;
		if (value.path) return value.path;
		if (value.buffer) return value.buffer;
		if (value.stream) return value.stream;
	}
	return value;
}

function download(url, options = {}) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith("https:") ? https : http;
		const request = client.get(url, { headers: options.headers || {} }, response => {
			if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
				response.resume();
				return resolve(download(new URL(response.headers.location, url).toString(), options));
			}
			if (response.statusCode < 200 || response.statusCode >= 300) {
				response.resume();
				return reject(new Error(`Download failed with HTTP ${response.statusCode}`));
			}
			const chunks = [];
			response.on("data", chunk => chunks.push(chunk));
			response.on("end", () => resolve(Buffer.concat(chunks)));
			response.on("error", reject);
		});
		request.on("error", reject);
		request.setTimeout(options.timeout || 60000, () => request.destroy(new Error("Download timed out")));
	});
}

function extensionFromMime(mime) {
	if (!mime) return "bin";
	return MIME_EXT[String(mime).split(";")[0].trim().toLowerCase()] || "bin";
}

function randomString(length = 10, allow = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
	let out = "";
	for (let i = 0; i < length; i++)
		out += allow[Math.floor(Math.random() * allow.length)];
	return out;
}

function formatTime(milliseconds) {
	if (!milliseconds || milliseconds < 0) milliseconds = 0;
	const seconds = Math.floor(milliseconds / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const parts = [];
	if (days) parts.push(`${days}d`);
	if (hours || days) parts.push(`${hours}h`);
	if (minutes || hours || days) parts.push(`${minutes}m`);
	parts.push(`${secs}s`);
	return parts.join(" ");
}

function replaceArgs(template, ...args) {
	let text = String(template == null ? "" : template);
	args.forEach((value, index) => {
		text = text.split(`%${index + 1}`).join(value == null ? "" : String(value));
	});
	return text;
}

function isNumericID(value) {
	return value != null && String(value).length > 0 && !Number.isNaN(Number(value));
}

/**
 * Pull an Instagram username out of user input: a profile URL
 * (https://www.instagram.com/name?…, /name/, /name), an @handle, or a bare
 * handle. Returns the bare username, or null when the input is not a handle.
 */
function instagramUsername(input) {
	if (input == null) return null;
	let value = String(input).trim();
	if (!value) return null;

	if (/^https?:\/\//i.test(value) || /^(www\.)?instagram\.com\//i.test(value)) {
		let url = value;
		if (!/^https?:\/\//i.test(url)) url = "https://" + url;
		try {
			const parsed = new URL(url);
			if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
			const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
			const reserved = ["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct"];
			if (!segment || reserved.includes(segment.toLowerCase())) return null;
			return segment.replace(/^@/, "");
		}
		catch (_) {
			return null;
		}
	}

	if (/^@[A-Za-z0-9._]{1,30}$/.test(value)) return value.slice(1);

	return null;
}

/**
 * Fetch a public Instagram profile (username or profile URL) via
 * web_profile_info. Returns a normalized profile, or null.
 *
 * The endpoint is unauthenticated and gets rate limited ("Please wait a few
 * minutes before you try again", HTTP 401) under bursts, so successful
 * username -> id lookups are cached on disk and reused.
 */
const USERNAME_CACHE_FILE = path.join(__dirname, "..", "data", "username-cache.json");
let usernameCache = null;

function loadUsernameCache() {
	if (usernameCache) return usernameCache;
	try {
		usernameCache = JSON.parse(fs.readFileSync(USERNAME_CACHE_FILE, "utf8")) || {};
	}
	catch (_) {
		usernameCache = {};
	}
	return usernameCache;
}

function saveUsernameCache() {
	try {
		fs.mkdirSync(path.dirname(USERNAME_CACHE_FILE), { recursive: true });
		fs.writeFileSync(USERNAME_CACHE_FILE, JSON.stringify(usernameCache));
	}
	catch (_) { }
}

/** Find a cached handle for a numeric user id (reverse of the handle cache). */
function cachedHandleForID(userID) {
	const wanted = String(userID || "");
	if (!wanted) return null;
	const cache = loadUsernameCache();
	for (const [handle, profile] of Object.entries(cache)) {
		if (profile && String(profile.userID) === wanted) return handle;
	}
	return null;
}

function extractProfileFromInfo(info, targetId) {
	if (!info || typeof info !== "object") return null;
	let user = null;
	const tid = targetId ? String(targetId) : null;
	if (tid && info[tid] && typeof info[tid] === "object") {
		user = info[tid];
	} else if (info.userID || info.userId || info.username || info.profilePicUrl || info.profile_pic_url || info.profilePicture || info.fullName) {
		user = info;
	} else {
		for (const val of Object.values(info)) {
			if (val && typeof val === "object" && (val.userID || val.userId || val.name || val.username || val.profilePicUrl || val.profilePicture || val.fullName)) {
				user = val;
				break;
			}
		}
	}
	if (!user) return null;

	const id = user.userID || user.userId || user.pk || user.pk_id || user.id || targetId;
	const pic = user.profilePicture || user.profilePicUrl || user.profile_pic_url_hd || user.profile_pic_url || user.thumbSrc || user.avatarUrl || (user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url) || null;
	const name = user.name || user.fullName || user.full_name || user.firstName || user.username || null;
	const username = user.vanity || user.username || null;
	const bio = user.biography || user.bio || "";
	const followers = user.followers ?? user.followerCount ?? user.follower_count;
	const following = user.following ?? user.followingCount ?? user.following_count;
	const posts = user.posts ?? user.mediaCount ?? user.media_count;
	const isPrivate = user.isPrivate ?? user.is_private;
	const isVerified = user.isVerified ?? user.is_verified;

	return {
		userID: id ? String(id) : null,
		username,
		name,
		biography: bio,
		followers,
		following,
		posts,
		isPrivate: Boolean(isPrivate),
		isVerified: Boolean(isVerified),
		profilePicture: pic
	};
}

async function fetchInstagramProfile(username, timeout = 15000, forceFresh = false) {
	const handle = instagramUsername(username) || (username ? String(username).replace(/^@/, "") : null);
	if (!handle) return null;

	const cache = loadUsernameCache();
	const cached = cache[handle.toLowerCase()];
	if (!forceFresh && cached && cached.userID && cached.profilePicture && (!cached.cachedAt || (Date.now() - cached.cachedAt < 6 * 3600 * 1000))) {
		return Object.assign({}, cached);
	}

	const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
	const headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
		"Accept": "application/json, text/plain, */*",
		"X-IG-App-ID": "936619743392459"
	};
	let buffer;
	try {
		buffer = await module.exports.download(url, { headers, timeout });
	}
	catch (_) {
		return cached && cached.userID ? Object.assign({}, cached) : null;
	}
	try {
		const data = JSON.parse(buffer.toString("utf8"));
		const user = data && data.data && data.data.user;
		if (!user) return cached && cached.userID ? Object.assign({}, cached) : null;
		const profile = {
			userID: user.id != null ? String(user.id) : null,
			username: user.username || handle,
			name: user.full_name || user.username || null,
			biography: user.biography || "",
			followers: user.edge_followed_by ? user.edge_followed_by.count : undefined,
			following: user.edge_follow ? user.edge_follow.count : undefined,
			posts: user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : undefined,
			isPrivate: !!user.is_private,
			isVerified: !!user.is_verified,
			profilePicture: (user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url) || user.profile_pic_url_hd || user.profile_pic_url || null,
			cachedAt: Date.now()
		};
		if (profile.userID) {
			cache[handle.toLowerCase()] = profile;
			saveUsernameCache();
		}
		return profile;
	}
	catch (_) {
		return cached && cached.userID ? Object.assign({}, cached) : null;
	}
}

/**
 * Resolve a username to an Instagram numeric user id via the public web
 * profile endpoint. This needs no login and works even though the underlying
 * ig-chat-api `getUserInfo` only accepts numeric ids.
 */
async function resolveInstagramUserID(username, timeout = 15000) {
	const profile = await fetchInstagramProfile(username, timeout);
	return profile ? profile.userID : null;
}

/**
 * True when an error from Instagram means "you are being throttled", not
 * "this user does not exist". Instagram answers bursts with HTTP 429, and the
 * generic "something went wrong / try again later" body. Reported to the user
 * as a temporary condition so a lookup is never mistaken for a missing user.
 */
function isRateLimitError(error) {
	const text = String(error && (error.error || error.message) || error);
	return /\b429\b|too many requests|rate.?limit|please wait|try again later|something went wrong/i.test(text);
}

/**
 * Resolve a target user id from command arguments, in order: a reply, an
 * explicit numeric id, then a username — given as an @handle, a bare handle,
 * or an Instagram profile URL. Instagram events do not carry a parsed
 * mentions list, so a mention arrives as the literal "@handle" text.
 *
 * Returns `{ id }` on success, else `{ id: null, username?, rateLimited? }`
 * where username is set when a handle was given but could not be found, and
 * rateLimited is set when Instagram throttled the lookup (so the caller can
 * say "try again" rather than "not found").
 */
async function resolveUserTarget(args, event, api) {
	const replySenderID = (event && event.messageReply && event.messageReply.senderID) ||
	                      (event && event.repliedMessage && event.repliedMessage.senderID) ||
	                      (event && event.replyTo && event.replyTo.senderID);
	if (replySenderID)
		return { id: String(replySenderID), source: "reply" };

	const numeric = (args || []).find(arg => /^\d+$/.test(arg));
	if (numeric) return { id: String(numeric), source: "id" };

	const raw = (args || []).find(arg => /^@?[A-Za-z0-9._]{1,30}$/.test(arg) || /instagram\.com\//i.test(arg));
	const username = instagramUsername(raw) || (raw && /^@?[A-Za-z0-9._]{1,30}$/.test(raw) ? raw.replace(/^@/, "") : null);
	if (username) {
		let rateLimited = false;
		// Prefer the authenticated session (uses the server's cookies, so it is
		// not rate limited the way the anonymous endpoint is). Fall back to the
		// public endpoint for servers that cannot resolve usernames.
		if (api) {
			try {
				let info = null;
				if (typeof api.getUserInfoByUsername === "function") {
					try {
						info = await new Promise((resolve, reject) =>
							api.getUserInfoByUsername(username, (error, result) => error ? reject(error) : resolve(result)));
					} catch (_) {}
				}
				if (!info && typeof api.getUserInfo === "function") {
					info = await new Promise((resolve, reject) =>
						api.getUserInfo(username, (error, result) => error ? reject(error) : resolve(result)));
				}
				const profile = extractProfileFromInfo(info, username);
				// Carry the fetched profile out so resolveProfile does not repeat
				// the same lookup (each call is a round trip that can be throttled).
				if (profile && profile.userID) {
					// Remember the handle->id pair so a later numeric-id lookup for
					// this account can recover the handle and use the public
					// endpoint when getUserInfo is throttled.
					const cache = loadUsernameCache();
					cache[username.toLowerCase()] = {
						userID: String(profile.userID),
						username: profile.username || username,
						name: profile.name || null,
						biography: profile.biography || "",
						followers: profile.followers,
						following: profile.following,
						isPrivate: profile.isPrivate,
						isVerified: profile.isVerified,
						profilePicture: profile.profilePicture || null,
						cachedAt: Date.now()
					};
					saveUsernameCache();
					return { id: String(profile.userID), source: "mention", profile };
				}
			}
			catch (error) {
				if (isRateLimitError(error)) rateLimited = true;
			}
		}
		// Only try the anonymous endpoint when the authenticated session did not
		// already tell us we are throttled. Hitting it while rate limited just
		// deepens the throttle and returns nothing.
		if (!rateLimited) {
			const id = await resolveInstagramUserID(username);
			if (id) return { id, source: "mention" };
		}
		return { id: null, username, rateLimited };
	}

	return { id: null };
}

/**
 * Resolve a full profile from command arguments: a reply to a user, a numeric
 * user id, or a username / @handle / profile URL. Returns a normalized profile
 * (`{ userID, username, name, biography, followers, following, posts,
 * isPrivate, isVerified, profilePicture }`), or null when nothing is found.
 * Sets `rateLimited` on the returned object when Instagram throttled us, so a
 * caller can distinguish "no such user" from "try again shortly".
 */
async function resolveProfile(args, event, api) {
	const isExplicitTarget = Array.isArray(args) && args.length > 0 && (/^\d+$/.test(args[0]) || /^@?[A-Za-z0-9._]{1,30}$/.test(args[0]));
	const target = await resolveUserTarget(args, isExplicitTarget ? null : event, api);
	if (!target.id) {
		return target.rateLimited ? { rateLimited: true } : null;
	}

	// A mention already fetched the profile while resolving the id; reuse it
	// rather than issuing a second getUserInfo for the same account.
	if (target.profile) {
		const extracted = extractProfileFromInfo(target.profile, target.id);
		if (extracted) return extracted;
	}

	let rateLimited = false;
	let authenticated = null;
	// The authenticated session is the reliable source of truth for a numeric
	// id (and is not rate limited like the public endpoint).
	const lookupAuthed = () => new Promise((resolve, reject) =>
		api.getUserInfo(String(target.id), (error, result) => error ? reject(error) : resolve(result)));
	if (api) {
		for (let attempt = 0; attempt < 2 && !authenticated; attempt++) {
			try {
				const info = await lookupAuthed();
				const extracted = extractProfileFromInfo(info, target.id);
				if (extracted) {
					authenticated = extracted;
				}
			}
			catch (error) {
				if (isRateLimitError(error)) {
					rateLimited = true;
					// Throttles are usually momentary: one short retry recovers
					// most of them without surfacing an empty profile to the user.
					if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
				}
			}
		}
	}

	// Instagram throttles `getUserInfo` in bursts, and even a 200 can omit the
	// social counts. The public profile fills the gaps, so `info` never reports
	// an empty follower/following/bio for a real account. It is only trusted
	// when it resolves to the SAME user id: a handle can collide with an
	// unrelated account, and overwriting a correct id with the wrong profile is
	// worse than a missing follower count.
	const incomplete = (p) => !p || p.followers == null || p.following == null || !p.biography || !p.profilePicture;
	if (incomplete(authenticated)) {
		const raw = (args || []).find(arg => instagramUsername(arg) || /^@?[A-Za-z0-9._]{1,30}$/.test(arg) && !/^\d+$/.test(arg));
		const handle = (raw && (instagramUsername(raw) || raw.replace(/^@/, ""))) ||
			(authenticated && authenticated.username) ||
			// A reply/numeric id has no handle in args; the cache may already know
			// which handle owns this id, letting the public endpoint fill the gaps.
			cachedHandleForID(target.id) || null;
		if (handle) {
			const publicProfile = await fetchInstagramProfile(handle);
			const sameUser = publicProfile && String(publicProfile.userID) === String(target.id);
			if (publicProfile && (!authenticated || sameUser)) {
				// With no authenticated data the public profile is the best we
				// have (it carries the id from the same lookup). With an
				// authenticated profile, only merge when the ids agree.
				return authenticated ? Object.assign({ }, authenticated, publicProfile) : publicProfile;
			}
		}
	}
	if (authenticated) return authenticated;

	const result = { userID: String(target.id) };
	if (rateLimited) result.rateLimited = true;
	return result;
}

function findImageInMessage(msg) {
	if (!msg) return null;
	if (typeof msg === "string" && /^https?:\/\//i.test(msg)) return msg;
	if (typeof msg !== "object") return null;

	// 1. Direct array of attachments or attachment field
	const attachs = Array.isArray(msg.attachments) ? msg.attachments : (msg.attachment ? (Array.isArray(msg.attachment) ? msg.attachment : [msg.attachment]) : []);
	for (const a of attachs) {
		if (!a) continue;
		if (typeof a === "string" && /^https?:\/\//i.test(a)) return a;
		const u = a.url || a.largePreviewUrl || a.large_preview_url || a.previewUrl || a.preview_url || a.thumbnailUrl || a.image || a.photo || a.src || a.uri || a.candidate?.url || a.candidates?.[0]?.url;
		if (u && typeof u === "string") return u;
		if (u && typeof u === "object" && u.url) return u.url;
		if (a.image_versions2?.candidates?.[0]?.url) return a.image_versions2.candidates[0].url;
		if (a.media?.image_versions2?.candidates?.[0]?.url) return a.media.image_versions2.candidates[0].url;
		if (a.video_versions?.[0]?.url) return a.video_versions[0].url;
		if (a.raw && typeof a.raw === "object") {
			const rawU = findImageInMessage(a.raw);
			if (rawU) return rawU;
		}
	}

	// 2. Direct image or media fields
	const m = msg.media || msg.visual_media?.media || msg.raven_media?.media || msg.clip?.clip || msg.media_share || msg.direct_story?.media || msg.xma_share;
	if (m) {
		const u = m.image_versions2?.candidates?.[0]?.url || m.candidates?.[0]?.url || m.video_versions?.[0]?.url || m.preview_url || m.target_url || m.url;
		if (u && typeof u === "string") return u;
	}
	if (msg.visual_media?.url && typeof msg.visual_media.url === "string") return msg.visual_media.url;
	if (msg.visual_media?.image_versions2?.candidates?.[0]?.url) return msg.visual_media.image_versions2.candidates[0].url;
	if (msg.raven_media?.image_versions2?.candidates?.[0]?.url) return msg.raven_media.image_versions2.candidates[0].url;
	if (msg.raven_media?.url) return msg.raven_media.url;
	if (msg.image_versions2?.candidates?.[0]?.url) return msg.image_versions2.candidates[0].url;
	if (msg.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url) {
		return msg.carousel_share.carousel_media[0].image_versions2.candidates[0].url;
	}
	if (msg.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url) {
		return msg.carousel_media[0].image_versions2.candidates[0].url;
	}
	if (msg.reel_share?.media?.image_versions2?.candidates?.[0]?.url) {
		return msg.reel_share.media.image_versions2.candidates[0].url;
	}
	if (msg.story_share?.media?.image_versions2?.candidates?.[0]?.url) {
		return msg.story_share.media.image_versions2.candidates[0].url;
	}
	if (msg.image) return typeof msg.image === "string" ? msg.image : (msg.image.url || (Array.isArray(msg.image) ? (typeof msg.image[0] === "string" ? msg.image[0] : msg.image[0]?.url) : null));
	if (msg.photo) return typeof msg.photo === "string" ? msg.photo : (msg.photo.url || (Array.isArray(msg.photo) ? (typeof msg.photo[0] === "string" ? msg.photo[0] : msg.photo[0]?.url) : null));
	if (Array.isArray(msg.images) && msg.images.length > 0) return typeof msg.images[0] === "string" ? msg.images[0] : msg.images[0]?.url;
	if (Array.isArray(msg.photos) && msg.photos.length > 0) return typeof msg.photos[0] === "string" ? msg.photos[0] : msg.photos[0]?.url;
	if (msg.url && (/\.(jpe?g|png|webp|gif|bmp)/i.test(msg.url) || /cdninstagram|fbcdn/i.test(msg.url))) return msg.url;

	// 3. Nested raw or message objects
	if (msg.raw && typeof msg.raw === "object" && msg.raw !== msg) {
		const rawU = findImageInMessage(msg.raw);
		if (rawU) return rawU;
	}
	if (msg.message && typeof msg.message === "object" && msg.message !== msg) {
		const msgU = findImageInMessage(msg.message);
		if (msgU) return msgU;
	}

	// 4. Link inside text/body
	const text = msg.body || msg.text || msg.caption?.text || (typeof msg.caption === "string" ? msg.caption : "");
	if (text) {
		const match = String(text).match(/https?:\/\/[^\s]+/i);
		if (match && (/\.(jpe?g|png|webp|gif|bmp)/i.test(match[0]) || /cdninstagram|fbcdn/i.test(match[0]))) return match[0];
	}

	return null;
}

async function extractImageUrl(event, args = [], apiOrOptions = null) {
	if (!event) return null;

	const api = (apiOrOptions && (apiOrOptions.getUserInfo || apiOrOptions.getThreadHistory) ? apiOrOptions : null) || (apiOrOptions && apiOrOptions.api) || null;

	// 1. Replied message object
	const reply = event.messageReply || event.repliedMessage || event.replyToMessage || event.reply_to_message || event.replyTo || event.replied_to_message || event.replied_to_item || event.reply_to_item || (event.raw && (event.raw.messageReply || event.raw.repliedMessage || event.raw.replyToMessage || event.raw.replied_to_message || event.raw.replied_to_item));
	if (reply && typeof reply === "object") {
		const u = findImageInMessage(reply);
		if (u) return u;
	}

	// 1b. Fast in-memory cache lookup by replied message ID
	const replyID = (reply && (reply.messageID || reply.item_id || reply.id || reply.mid)) ||
	                (typeof event.replyTo === "string" || typeof event.replyTo === "number" ? String(event.replyTo) : (event.replyTo && (event.replyTo.messageID || event.replyTo.item_id || event.replyTo.id))) ||
	                event.replyToItemId || event.replied_to_item_id || event.reply_to_item_id ||
	                event.replied_to_target_id || event.reply_to_target_id ||
	                (event.raw && (event.raw.replyTo || event.raw.replied_to_item_id || event.raw.replied_to_target_id));

	if (replyID) {
		const idStr = String(replyID);
		if (global.recentMessages && global.recentMessages.has(idStr)) {
			const cached = global.recentMessages.get(idStr);
			const u = findImageInMessage(cached);
			if (u) return u;
		}
		const icaRecent = (api && api._raw && api._raw.mqtt && api._raw.mqtt._recentMessages) ||
		                  (api && api._recentMessages);
		if (icaRecent && icaRecent.has(idStr)) {
			const cached = icaRecent.get(idStr);
			const u = findImageInMessage(cached);
			if (u) return u;
		}
	}

	// 2. Current message attachments & media
	const currUrl = findImageInMessage(event);
	if (currUrl) return currUrl;
	if (event.raw && typeof event.raw === "object") {
		const rawUrl = findImageInMessage(event.raw);
		if (rawUrl) return rawUrl;
	}

	// 3. Direct URL in args
	if (Array.isArray(args) && args.length > 0) {
		for (const a of args) {
			if (typeof a === "string" && /^https?:\/\//i.test(a)) return a;
		}
	}

	// 4. Direct URL in message body
	if (event.body || event.text) {
		const m = String(event.body || event.text).match(/https?:\/\/[^\s]+/i);
		if (m && (/\.(jpe?g|png|webp|gif|bmp)/i.test(m[0]) || /cdninstagram|fbcdn/i.test(m[0]))) return m[0];
	}

	// 5. If we have api and threadID, check thread history with timeout race
	const threadID = event.threadID || event.threadId || (event.raw && (event.raw.threadID || event.raw.thread_id));
	if (api && threadID && (typeof api.getThreadHistory === "function" || typeof api.getThreadInfo === "function")) {
		try {
			const historyPromise = new Promise((resolve) => {
				let done = false;
				const handler = (err, res) => {
					if (done) return;
					done = true;
					if (err) return resolve(null);
					const msgs = (res && res.messages) || (res && res.items) || (res && res.thread && res.thread.items) || (Array.isArray(res) ? res : null);
					resolve(msgs);
				};
				try {
					if (typeof api.getThreadHistory === "function") {
						const ret = api.getThreadHistory(threadID, 15, undefined, handler);
						if (ret && typeof ret.then === "function") {
							ret.then(res => handler(null, res)).catch(err => handler(err));
						}
					} else if (typeof api.getThreadInfo === "function") {
						const ret = api.getThreadInfo(threadID, handler);
						if (ret && typeof ret.then === "function") {
							ret.then(res => handler(null, res)).catch(err => handler(err));
						}
					}
				} catch (_) {
					resolve(null);
				}
			});

			const history = await Promise.race([
				historyPromise,
				new Promise(resolve => setTimeout(() => resolve(null), 3500))
			]);

			if (Array.isArray(history) && history.length > 0) {
				if (replyID) {
					const target = history.find(m => String(m.messageID || m.item_id || m.id) === String(replyID));
					if (target) {
						const u = findImageInMessage(target);
						if (u) return u;
					}
				}
				for (const m of history) {
					if (String(m.messageID || m.item_id) === String(event.messageID)) continue;
					const u = findImageInMessage(m);
					if (u) return u;
				}
			}
		} catch (_) {}
	}

	return null;
}

function extractMediaUrl(event, args = [], kind = "any") {
	if (!event) return null;
	const reply = event.messageReply || event.repliedMessage || event.replyToMessage;
	if (reply) {
		const attachs = Array.isArray(reply.attachments) ? reply.attachments : (reply.attachment ? [reply.attachment] : []);
		for (const a of attachs) {
			if (!a) continue;
			if (kind === "any" || a.type === kind) {
				const u = a.url || a.largePreviewUrl || a.large_preview_url || a.previewUrl || a.preview_url || a.thumbnailUrl;
				if (u) return u;
			}
		}
		if (reply.url) return reply.url;
		if (reply.body || reply.text) {
			const m = String(reply.body || reply.text).match(/https?:\/\/[^\s]+/i);
			if (m) return m[0];
		}
	}
	const attachs = Array.isArray(event.attachments) ? event.attachments : (event.attachment ? [event.attachment] : []);
	for (const a of attachs) {
		if (!a) continue;
		if (kind === "any" || a.type === kind) {
			const u = a.url || a.largePreviewUrl || a.large_preview_url || a.previewUrl || a.preview_url || a.thumbnailUrl;
			if (u) return u;
		}
	}
	if (Array.isArray(args)) {
		for (const a of args) {
			if (typeof a === "string" && /^https?:\/\/[^\s]+/i.test(a)) return a;
		}
	}
	if (event.body || event.text) {
		const m = String(event.body || event.text).match(/https?:\/\/[^\s]+/i);
		if (m) return m[0];
	}
	return null;
}

module.exports = {
	getType,
	isStream,
	isBuffer,
	isUrl,
	isNumericID,
	extensionOf,
	extensionFromMime,
	mediaKind,
	toSource,
	download,
	randomString,
	formatTime,
	replaceArgs,
	instagramUsername,
	fetchInstagramProfile,
	resolveInstagramUserID,
	resolveUserTarget,
	resolveProfile,
	isRateLimitError,
	extractImageUrl,
	extractMediaUrl,
	findImageInMessage,
	_resetUsernameCache() {
		usernameCache = {};
		try { fs.rmSync(USERNAME_CACHE_FILE, { force: true }); }
		catch (_) { }
	}
};
