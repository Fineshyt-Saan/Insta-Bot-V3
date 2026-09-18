"use strict";

/**
 * platforms/instagram/emulation/browserSession.js
 *
 * User-Session Emulation Core:
 * Emulates the exact HTTP headers, TLS fingerprint expectations, and browser session state
 * that Instagram Web / Messenger uses, bypassing Meta anti-bot challenges and heuristic blocks.
 */

const { CookieJar, Cookie } = require("tough-cookie");
const crypto = require("crypto");

const TRUSTED_DOMAINS = new Set([
	".instagram.com",
	"instagram.com",
	".facebook.com",
	"facebook.com",
	"i.instagram.com"
]);

const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

class BrowserSession {
	constructor(options = {}) {
		this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
		this.viewportWidth = options.viewportWidth || 1280;
		this.viewportHeight = options.viewportHeight || 800;
		this.appId = options.appId || "936619743392459"; // Instagram Web Direct App ID
		this.asbdId = options.asbdId || "129477"; // Meta Browser ASBD ID
		this.pigeonSessionId = options.pigeonSessionId || this.generateUUID();
		this.deviceId = options.deviceId || ("android-" + crypto.randomBytes(8).toString("hex"));
		this.uuid = options.uuid || this.generateUUID();
		this.wwwClaim = "0";
		this.jar = new CookieJar();
		this.userId = null;
		this.sessionId = null;
		this.csrfToken = null;

		if (options.cookies) {
			this.loadCookies(options.cookies);
		}
	}

	generateUUID() {
		return crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
			const r = Math.random() * 16 | 0;
			const v = c === "x" ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	loadCookies(cookieInput) {
		if (!cookieInput) return;
		let entries = [];

		if (typeof cookieInput === "string") {
			const trimmed = cookieInput.trim();
			if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
				try {
					const parsed = JSON.parse(trimmed);
					entries = Array.isArray(parsed) ? parsed : (parsed.cookies || Object.values(parsed));
				} catch (_) {
					entries = this.parseHeaderString(trimmed);
				}
			} else if (trimmed.includes("\t")) {
				entries = this.parseNetscape(trimmed);
			} else {
				entries = this.parseHeaderString(trimmed);
			}
		} else if (Array.isArray(cookieInput)) {
			entries = cookieInput;
		} else if (typeof cookieInput === "object") {
			if (Array.isArray(cookieInput.cookies)) entries = cookieInput.cookies;
			else entries = Object.entries(cookieInput).map(([name, value]) => ({ name, value }));
		}

		for (const entry of entries) {
			if (!entry) continue;
			const name = entry.name || entry.key;
			const value = entry.value;
			if (!name || value == null) continue;

			const domain = (entry.domain || ".instagram.com").toLowerCase();
			const isTrusted = TRUSTED_DOMAINS.has(domain) || [...TRUSTED_DOMAINS].some(d => domain.endsWith(d));
			if (!isTrusted) continue;

			try {
				const tough = new Cookie({
					key: name,
					value: String(value),
					domain: domain.startsWith(".") ? domain : `.${domain}`,
					path: entry.path || "/",
					secure: entry.secure !== false,
					httpOnly: Boolean(entry.httpOnly),
					sameSite: entry.sameSite || "Lax"
				});
				this.jar.setCookieSync(tough, `https://www.instagram.com${tough.path}`);
			} catch (_) {}

			if (name === "ds_user_id" || name === "c_user") this.userId = String(value);
			if (name === "sessionid") this.sessionId = String(value);
			if (name === "csrftoken") this.csrfToken = String(value);
		}
	}

	parseHeaderString(header) {
		return header.split(";").map(part => {
			const [key, ...vals] = part.trim().split("=");
			if (!key) return null;
			return { name: key.trim(), value: vals.join("=").trim(), domain: ".instagram.com", path: "/" };
		}).filter(Boolean);
	}

	parseNetscape(text) {
		const cookies = [];
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const parts = trimmed.split("\t");
			if (parts.length >= 7) {
				cookies.push({
					domain: parts[0],
					path: parts[2],
					secure: parts[3] === "TRUE",
					name: parts[5],
					value: parts[6]
				});
			}
		}
		return cookies;
	}

	getCookieString(url = "https://www.instagram.com/") {
		try {
			const str = this.jar.getCookieStringSync(url);
			if (str && str.trim()) return str;
			const all = this.jar.serializeSync().cookies || [];
			return all.map(c => `${c.key}=${c.value}`).join("; ");
		} catch (_) {
			try {
				const all = this.jar.serializeSync().cookies || [];
				return all.map(c => `${c.key}=${c.value}`).join("; ");
			} catch (_) {
				return "";
			}
		}
	}

	getBrowserHeaders(extraHeaders = {}) {
		const cookieStr = this.getCookieString("https://www.instagram.com/");
		const allCookies = this.jar.serializeSync().cookies || [];
		const csrf = this.csrfToken || (allCookies.find(c => c.key === "csrftoken")?.value) || "";
		const igDid = allCookies.find(c => c.key === "ig_did")?.value || "";

		const headers = {
			"User-Agent": this.userAgent,
			"Accept": "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "gzip, deflate, br, zstd",
			"Origin": "https://www.instagram.com",
			"Referer": "https://www.instagram.com/direct/inbox/",
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-Mode": "cors",
			"Sec-Fetch-Dest": "empty",
			"sec-ch-ua": '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"',
			"sec-ch-ua-mobile": "?0",
			"sec-ch-ua-platform": '"Windows"',
			"X-IG-App-ID": this.appId,
			"X-ASBD-ID": this.asbdId,
			"X-IG-WWW-Claim": this.wwwClaim,
			"X-Pigeon-Session-Id": this.pigeonSessionId,
			"X-Pigeon-Rawclienttime": (Date.now() / 1000).toFixed(3),
			"X-Requested-With": "XMLHttpRequest",
			"Viewport-Width": String(this.viewportWidth),
			"Viewport-Height": String(this.viewportHeight)
		};

		if (csrf) headers["X-CSRFToken"] = csrf;
		if (igDid) headers["X-IG-D"] = igDid;
		if (cookieStr) headers["Cookie"] = cookieStr;

		return Object.assign(headers, extraHeaders);
	}

	getMqttWsHeaders() {
		const cookieStr = this.getCookieString("https://www.instagram.com/");
		const allCookies = this.jar.serializeSync().cookies || [];
		const csrf = this.csrfToken || (allCookies.find(c => c.key === "csrftoken")?.value) || "";
		const igDid = allCookies.find(c => c.key === "ig_did")?.value || "";

		return {
			"User-Agent": this.userAgent,
			"Accept-Language": "en-US,en;q=0.9",
			"Origin": "https://www.instagram.com",
			"Referer": "https://www.instagram.com/direct/inbox/",
			"Sec-WebSocket-Version": "13",
			"Sec-Fetch-Site": "same-site",
			"Sec-Fetch-Mode": "websocket",
			"Sec-Fetch-Dest": "websocket",
			"sec-ch-ua": '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"',
			"sec-ch-ua-mobile": "?0",
			"sec-ch-ua-platform": '"Windows"',
			"X-IG-App-ID": this.appId,
			"X-ASBD-ID": this.asbdId,
			"X-CSRFToken": csrf,
			"X-IG-D": igDid,
			"Cookie": cookieStr
		};
	}

	exportAppState() {
		return (this.jar.serializeSync().cookies || []).map(c => ({
			key: c.key,
			name: c.key,
			value: c.value,
			domain: c.domain,
			path: c.path,
			secure: c.secure,
			httpOnly: c.httpOnly,
			sameSite: c.sameSite
		}));
	}
}

module.exports = { BrowserSession, DEFAULT_USER_AGENT };
