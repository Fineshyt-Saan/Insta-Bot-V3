"use strict";

/**
 * core/eventLoader.js
 *
 * Discovers, validates, and loads event handlers from events/ directory.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

class EventLoader {
	constructor(eventsDir = path.resolve(__dirname, "../events")) {
		this.eventsDir = eventsDir;
		this.events = new Map();

		global.GoatBot = global.GoatBot || {};
		global.GoatBot.events = this.events;
	}

	async loadEvents() {
		this.events.clear();

		if (!fs.existsSync(this.eventsDir)) {
			logger.warn(`Events directory not found: ${this.eventsDir}`);
			return { loaded: 0, failed: 0 };
		}

		const files = fs.readdirSync(this.eventsDir).filter(f => f.endsWith(".js"));
		let loaded = 0;
		let failed = 0;

		for (const file of files) {
			const filePath = path.join(this.eventsDir, file);
			try {
				delete require.cache[require.resolve(filePath)];
				const evt = require(filePath);
				const config = evt.config || evt.meta || {};
				const name = config.name || path.basename(file, ".js");

				this.events.set(name.toLowerCase(), evt);
				loaded++;
			} catch (err) {
				logger.error(`Failed to load event ${file}`, { error: err.message });
				failed++;
			}
		}

		logger.info(`Loaded ${loaded} event handlers, ${failed} failed`);
		return { loaded, failed };
	}

	getEvent(name) {
		if (!name) return null;
		return this.events.get(String(name).toLowerCase().trim()) || null;
	}

	getAllEventNames() {
		return Array.from(this.events.keys());
	}

	async handleEvent(name, data, context = {}) {
		const evt = this.getEvent(name);
		if (!evt) return;

		try {
			if (typeof evt.run === "function") {
				await evt.run(context.bot || global.GoatBot.instance, data);
			} else if (typeof evt.onStart === "function") {
				await evt.onStart({ event: data, ...context });
			}
		} catch (err) {
			logger.error(`Error executing event handler [${name}]`, { error: err.message });
		}
	}
}

module.exports = { EventLoader };
