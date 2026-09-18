"use strict";

/**
 * platforms/instagram/adapter/client.js
 *
 * Instagram Connection Client:
 * - Boots and authenticates via direct cookies, email/password, or remote RPC server.
 * - Manages session saving and cookie refreshes.
 * - Sets up real-time event listener and normalizes events with `normalizer.js`.
 * - Handles reconnection logic with exponential backoff on network/session issues.
 */

const EventEmitter = require("events");
const fs = require("fs-extra");
const path = require("path");
const { getICA } = require("../ica");
const { normalizeEvent } = require("../events/normalizer");
const { createAPIWrapper } = require("./apiWrapper");
const logger = require("../../../utils/logger");

class InstagramClient extends EventEmitter {
	constructor(config) {
		super();
		this.config = config;
		this.ica = null;
		this.rawApi = null;
		this.api = null;
		this.userID = null;
		this.username = null;
		this.isRunning = false;
		this.connectionStatus = "offline"; // 'offline', 'online', 'reconnecting', 'auth_error'
		this.lastErrorReason = null;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = config.MAX_RECONNECT_ATTEMPTS || 10;
		this.reconnectDelay = 5000;
		this._reconnectTimer = null;
		this._stopListener = null;
	}

	loadCredentials() {
		const cookiePath = path.resolve(this.config.ACCOUNT_FILE || "./account.txt");
		let cookieData = null;

		if (process.env.ACCOUNT_COOKIE && process.env.ACCOUNT_COOKIE.trim()) {
			cookieData = process.env.ACCOUNT_COOKIE.trim();
		} else if (fs.existsSync(cookiePath)) {
			try {
				cookieData = fs.readFileSync(cookiePath, "utf-8").trim();
			} catch (_) {}
		}

		if (cookieData) {
			let appState;
			if (cookieData.startsWith("[") || cookieData.startsWith("{")) {
				try {
					const parsed = JSON.parse(cookieData);
					if (parsed.httpSession && parsed.httpSession.cookies) {
						const inner = parsed.httpSession.cookies;
						appState = inner.cookies || (Array.isArray(inner) ? inner : Object.values(inner));
					} else if (parsed.cookies && Array.isArray(parsed.cookies.cookies)) appState = parsed.cookies.cookies;
					else if (parsed.cookies && Array.isArray(parsed.cookies)) appState = parsed.cookies;
					else if (parsed.cookies && typeof parsed.cookies === "object") appState = Object.values(parsed.cookies);
					else if (Array.isArray(parsed)) appState = parsed;
					else if (typeof parsed === "object") appState = parsed;
				} catch (_) {}
			}

			if (!appState && cookieData.includes("=")) {
				appState = cookieData.split(";").map(c => {
					const parts = c.trim().split("=");
					const name = parts[0];
					const value = parts.slice(1).join("=");
					if (!name || !value) return null;
					return { key: name.trim(), value: value.trim(), domain: ".instagram.com", path: "/" };
				}).filter(Boolean);
			}

			if (appState && appState.length) {
				return { appState, raw: cookieData };
			}
			return { cookie: cookieData, raw: cookieData };
		}

		if (this.config.ACCOUNT_EMAIL && this.config.ACCOUNT_PASSWORD) {
			return {
				email: this.config.ACCOUNT_EMAIL,
				password: this.config.ACCOUNT_PASSWORD
			};
		}

		return null;
	}

	async connect() {
		const icaInfo = getICA(this.config);
		this.ica = icaInfo;

		logger.info(`Authenticating with Instagram in [${icaInfo.mode}] mode...`);
		const credentials = this.loadCredentials();

		let loginParam;
		if (icaInfo.mode === "remote") {
			loginParam = {
				server: this.config.server?.url || process.env.IG_API_SERVER,
				token: this.config.server?.token || process.env.IG_API_TOKEN,
				cookies: credentials?.raw || null,
				selfListen: Boolean(this.config.SELF_LISTEN)
			};
		} else {
			if (!credentials) {
				throw new Error(
					"No Instagram credentials found. Please provide cookies in account.txt, " +
					"or set ACCOUNT_EMAIL & ACCOUNT_PASSWORD in config/.env."
				);
			}
			loginParam = credentials.appState ? { appState: credentials.appState } : (credentials.email ? credentials : credentials.cookie);
		}

		try {
			this.rawApi = await icaInfo.login(loginParam, { autoListen: false, ...(this.config.OPTIONS_ICA || {}) });
		} catch (err) {
			this.connectionStatus = "auth_error";
			this.lastErrorReason = err.message;
			throw err;
		}

		if (!this.rawApi) {
			throw new Error("Instagram login returned null API instance.");
		}

		// Resolve User ID
		try {
			const id = typeof this.rawApi.getCurrentUserID === "function" ? this.rawApi.getCurrentUserID() : this.rawApi._userID;
			this.userID = typeof id === "object" ? (id?.userID || id?.userId || String(id)) : String(id || "unknown");
		} catch (_) {
			this.userID = "unknown";
		}

		this.username = this.userID;
		this.api = createAPIWrapper(this.rawApi, this.config);
		this.isRunning = true;
		this.connectionStatus = "online";
		this.reconnectAttempts = 0;

		logger.info(`Instagram session established! Bot UserID: ${this.userID}`);

		// Hook cookie updates and error events safely
		if (this.rawApi && typeof this.rawApi.on === "function") {
			this.rawApi.on("cookiesUpdated", () => this.saveSession());
			this.rawApi.on("error", (err) => {
				const msg = err && err.message ? err.message : String(err);
				logger.warn("Underlying Instagram API runtime notice", { error: msg });
			});
		}
		this.saveSession();

		this.startListener();
		this.emit("ready", { userID: this.userID, api: this.api });
		return this.api;
	}

	saveSession() {
		try {
			if (!this.rawApi) return;
			let sessionData = null;
			if (typeof this.rawApi.exportSession === "function") {
				sessionData = this.rawApi.exportSession("json");
			} else if (typeof this.rawApi.getSession === "function") {
				sessionData = JSON.stringify(this.rawApi.getSession(), null, 2);
			}
			if (sessionData && this.config.ACCOUNT_FILE) {
				fs.writeFileSync(path.resolve(this.config.ACCOUNT_FILE), sessionData, "utf-8");
			}
		} catch (err) {
			logger.warn("Failed to persist session to account file", { error: err.message });
		}
	}

	startListener() {
		if (typeof this.rawApi.listen !== "function") {
			logger.error("Underlying ICA has no listen() method.");
			return;
		}

		logger.info("Listening for real-time Instagram Direct events...");
		try {
			this._stopListener = this.rawApi.listen((err, rawEvent) => {
				if (err) {
					const msg = err.message || String(err);
					logger.error("Listener error", { error: msg });

					const isAuthError = /not authorized|login_required|unauthorized|checkpoint/i.test(msg);
					if (isAuthError) {
						this.connectionStatus = "auth_error";
						this.lastErrorReason = msg;
					}
					this.emit("error", err);
					this.scheduleReconnect();
					return;
				}

				if (!rawEvent) return;

				try {
					const event = normalizeEvent(rawEvent, this.userID);
					this.emit("event", event);
					if (event.type) {
						this.emit(event.type, event);
					}
				} catch (normErr) {
					logger.error("Failed to process event", { error: normErr.message });
				}
			});
		} catch (err) {
			logger.error("Exception starting listener", { error: err.message });
			this.scheduleReconnect();
		}
	}

	scheduleReconnect() {
		if (this._reconnectTimer) return;
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			logger.error(`Exceeded maximum reconnect attempts (${this.maxReconnectAttempts}). Halting reconnection.`);
			return;
		}

		this.reconnectAttempts++;
		this.connectionStatus = "reconnecting";
		const delay = Math.min(60000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1));
		logger.warn(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay / 1000)}s...`);

		this._reconnectTimer = setTimeout(async () => {
			this._reconnectTimer = null;
			try {
				if (typeof this._stopListener === "function") {
					try { this._stopListener(); } catch (_) {}
				}
				await this.connect();
			} catch (err) {
				logger.error("Reconnect attempt failed", { error: err.message });
				this.scheduleReconnect();
			}
		}, delay);
		if (this._reconnectTimer.unref) this._reconnectTimer.unref();
	}

	async stop() {
		this.isRunning = false;
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
		if (typeof this._stopListener === "function") {
			try { this._stopListener(); } catch (_) {}
		}
		if (this.rawApi && typeof this.rawApi.stopListening === "function") {
			try { this.rawApi.stopListening(); } catch (_) {}
		}
		this.connectionStatus = "offline";
		this.emit("disconnected");
	}
}

module.exports = { InstagramClient };
