"use strict";

/**
 * core/bot.js
 *
 * Central Bot Orchestrator:
 * - Couples the platform-neutral core with the Instagram adapter.
 * - Manages bot lifecycle (start, stop, reconnect).
 * - Exposes GoatBot V2 global ecosystem.
 */

const EventEmitter = require("events");
const TTLMap = require("../func/TTLMap");
const { CommandLoader } = require("./commandLoader");
const { EventLoader } = require("./eventLoader");
const { Dispatcher } = require("./dispatcher");
const { InstagramClient } = require("../platforms/instagram/adapter/client");
const { createStatusServer } = require("./statusServer");
const { Scheduler } = require("./scheduler/scheduler");
const Banner = require("../utils/banner");
const logger = require("../utils/logger");

class Bot extends EventEmitter {
	constructor(config = require("../config")) {
		super();
		this.config = config;

		// 1. Setup global GoatBot ecosystem
		global.utils = require("../utils.js");
		global.GoatBot = global.GoatBot || {};
		global.GoatBot.config = this.config;
		global.GoatBot.onReply = global.GoatBot.onReply || new TTLMap({ ttl: 30 * 60 * 1000, maxSize: 500 });
		global.GoatBot.onReaction = global.GoatBot.onReaction || new TTLMap({ ttl: 30 * 60 * 1000, maxSize: 500 });
		global.GoatBot.onEvent = global.GoatBot.onEvent || new Map();
		global.GoatBot.onChat = global.GoatBot.onChat || new Map();
		global.GoatBot.instance = this;
		global.client = global.client || {};

		// 2. Initialize subsystems
		this.client = new InstagramClient(this.config);
		this.commandLoader = new CommandLoader();
		this.eventLoader = new EventLoader();
		this.dispatcher = new Dispatcher(this);
		this.scheduler = new Scheduler(this);
		this.statusServer = createStatusServer(this);

		this.api = null;
		this.userID = null;
		this.username = null;
		this.isRunning = false;

		// 3. Connect client events
		this.client.on("event", (event) => {
			this.dispatcher.dispatch(event).catch((err) => {
				logger.error("Dispatcher unhandled error", { error: err.message });
			});
		});

		this.client.on("ready", ({ userID, api }) => {
			this.userID = userID;
			this.username = userID;
			this.api = api;
			this.isRunning = true;

			global.GoatBot.icaApi = api;
			global.GoatBot.fcaApi = api;

			// Invoke onLoad for all commands now that API is active
			const database = global.db || require("../utils/database");
			for (const [name, cmd] of this.commandLoader.commands) {
				if (typeof cmd.onLoad === "function") {
					try {
						cmd.onLoad({
							api,
							bot: this,
							database,
							usersData: database.usersData,
							threadsData: database.threadsData
						});
					} catch (err) {
						logger.error(`Error in onLoad of ${name}`, { error: err.message });
					}
				}
			}

			// Invoke custom.js hook if present
			try {
				const customPath = require.resolve("../bot/custom.js");
				const custom = require(customPath);
				if (typeof custom === "function") {
					custom({
						api,
						bot: this,
						database,
						usersData: database.usersData,
						threadsData: database.threadsData,
						globalData: database.globalData,
						getText: (h, k, ...a) => global.utils ? global.utils.getText(h, k, ...a) : ""
					});
				}
			} catch (_) {}

			this.scheduler.start();
			this.emit("ready", { userID, api });
		});

		this.client.on("error", (err) => {
			this.emit("error", err);
		});
	}

	async start() {
		Banner.display();
		logger.info("Initializing InstaBOT core...");

		// 1. Initialize Database
		const database = require("../utils/database");
		await database.ready;
		global.db = database;
		global.client.database = {
			usersData: database.usersData,
			threadsData: database.threadsData,
			globalData: database.globalData
		};

		// 2. Load Commands and Events
		await this.commandLoader.loadCommands();
		await this.eventLoader.loadEvents();

		// 3. Start Status Server (Satisfies cloud health probes)
		try {
			await this.statusServer.start();
		} catch (err) {
			logger.warn("Status server could not start", { error: err.message });
		}

		// 4. Connect to Instagram
		try {
			const api = await this.client.connect();
			this.api = api;
			return this;
		} catch (err) {
			logger.error("Failed to connect to Instagram", { error: err.message });
			if (this.config.AUTO_RECONNECT) {
				this.client.scheduleReconnect();
			} else {
				throw err;
			}
			return this;
		}
	}

	async stop() {
		this.isRunning = false;
		this.scheduler.stop();
		await this.statusServer.stop();
		await this.client.stop();
		logger.info("InstaBOT has cleanly stopped.");
	}

	// Backwards-compatible helper methods
	getThreadInfo(threadID) {
		return this.api ? this.api.getThreadInfo(threadID) : Promise.reject(new Error("API not ready"));
	}

	getUserInfo(userID) {
		return this.api ? this.api.getUserInfo(userID) : Promise.reject(new Error("API not ready"));
	}

	sendMessage(form, threadID, callback, replyTo) {
		return this.api ? this.api.sendMessage(form, threadID, callback, replyTo) : Promise.reject(new Error("API not ready"));
	}
}

module.exports = Bot;
