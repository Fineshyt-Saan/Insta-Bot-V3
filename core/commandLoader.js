"use strict";

/**
 * core/commandLoader.js
 *
 * Discovers, validates, and registers commands:
 * - Scans commands directory.
 * - Indexes by name and aliases.
 * - Supports Floppa GoatBot V2 format (onStart, onReply, onReaction, onChat, onEvent, onLoad).
 * - Supports legacy / alternative format (run).
 * - Supports hot-reloading individual commands.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

class CommandLoader {
	constructor(commandsDir = path.resolve(__dirname, "../commands")) {
		this.commandsDir = commandsDir;
		this.commands = new Map();
		this.aliases = new Map();

		global.GoatBot = global.GoatBot || {};
		global.GoatBot.commands = this.commands;
		global.GoatBot.aliases = this.aliases;
	}

	async loadCommands() {
		this.commands.clear();
		this.aliases.clear();

		if (!fs.existsSync(this.commandsDir)) {
			logger.warn(`Commands directory not found: ${this.commandsDir}`);
			return { loaded: 0, failed: 0 };
		}

		const files = fs.readdirSync(this.commandsDir).filter(f => f.endsWith(".js"));
		let loaded = 0;
		let failed = 0;

		for (const file of files) {
			const filePath = path.join(this.commandsDir, file);
			try {
				delete require.cache[require.resolve(filePath)];
				const cmd = require(filePath);

				const config = cmd.config || cmd.meta;
				if (!config || !config.name) {
					logger.warn(`Skipping ${file}: missing config.name`);
					failed++;
					continue;
				}

				if (typeof cmd.onStart !== "function" && typeof cmd.run !== "function" && typeof cmd.execute !== "function") {
					logger.warn(`Skipping ${file}: missing onStart or run handler`);
					failed++;
					continue;
				}

				const name = config.name.toLowerCase();
				this.commands.set(name, cmd);

				if (Array.isArray(config.aliases)) {
					for (const alias of config.aliases) {
						if (typeof alias === "string" && alias.trim()) {
							this.aliases.set(alias.toLowerCase().trim(), name);
						}
					}
				}

				loaded++;
			} catch (err) {
				logger.error(`Failed to load command ${file}`, { error: err.message });
				failed++;
			}
		}

		logger.info(`Loaded ${loaded} commands (${this.aliases.size} aliases), ${failed} failed`);
		return { loaded, failed };
	}

	getCommand(nameOrAlias) {
		if (!nameOrAlias) return null;
		const query = String(nameOrAlias).toLowerCase().trim();
		if (this.commands.has(query)) {
			return this.commands.get(query);
		}
		if (this.aliases.has(query)) {
			const realName = this.aliases.get(query);
			return this.commands.get(realName);
		}
		return null;
	}

	get(nameOrAlias) {
		return this.getCommand(nameOrAlias);
	}

	getAllCommands() {
		return Array.from(this.commands.entries());
	}

	getAllCommandNames() {
		return Array.from(this.commands.keys());
	}

	reloadCommand(commandName) {
		const name = String(commandName).toLowerCase().trim();
		const targetName = this.aliases.get(name) || name;

		const files = fs.readdirSync(this.commandsDir).filter(f => f.endsWith(".js"));
		for (const file of files) {
			const filePath = path.join(this.commandsDir, file);
			try {
				delete require.cache[require.resolve(filePath)];
				const cmd = require(filePath);
				const cfg = cmd.config || cmd.meta;
				if (cfg && cfg.name && cfg.name.toLowerCase() === targetName) {
					this.commands.set(targetName, cmd);
					if (Array.isArray(cfg.aliases)) {
						for (const a of cfg.aliases) {
							this.aliases.set(a.toLowerCase().trim(), targetName);
						}
					}
					return { success: true, command: targetName };
				}
			} catch (err) {
				return { success: false, error: err.message };
			}
		}
		return { success: false, error: `Command "${commandName}" file not found` };
	}
}

module.exports = { CommandLoader };
