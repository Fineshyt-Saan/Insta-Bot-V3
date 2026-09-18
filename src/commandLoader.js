"use strict";

/**
 * Command + event script loader.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");
const log = require("./logger");

if (!global.utils) {
	try {
		global.utils = require("../utils.js");
	} catch (_) {}
}

const ROOT = path.resolve(__dirname, "..");

const REQUIRED = ["name", "category"];

function validate(script, file, type) {
	if (!script || typeof script !== "object")
		throw new Error(`${file}: ${type} must export an object`);
	if (typeof script.config !== "object" || !script.config)
		throw new Error(`${file}: missing "config" object`);

	if (!script.config.name) script.config.name = file.replace(/\.js$/, "");
	if (!script.config.category) script.config.category = "utility";
	if (typeof script.onStart !== "function" && typeof script.run === "function") {
		script.onStart = script.run;
	}
	if (script.config.cooldown == null && script.config.countDown != null) {
		script.config.cooldown = script.config.countDown;
	}
	if (!script.config.description) {
		script.config.description = script.config.shortDescription || script.config.longDescription || "";
	}
	if (!script.config.usage && script.config.guide) {
		script.config.usage = typeof script.config.guide === "object" ? (script.config.guide.en || Object.values(script.config.guide)[0] || "") : String(script.config.guide);
	}

	for (const key of REQUIRED) {
		if (!script.config[key])
			throw new Error(`${file}: config.${key} is required`);
	}
	if (typeof script.onStart !== "function" && typeof script.onEvent !== "function")
		throw new Error(`${file}: define onStart (commands) or onEvent (events)`);
}

/**
 * Load every .js file from a directory (non-recursive), validate it and
 * return an array of { file, script, commandName } entries.
 */
function loadDirectory(dirName, type) {
	const dir = path.join(ROOT, dirName);
	if (!fs.existsSync(dir)) return [];
	const results = [];
	for (const file of fs.readdirSync(dir).sort()) {
		if (!file.endsWith(".js") || file.endsWith(".eg.js")) continue;
		const full = path.join(dir, file);
		try {
			delete require.cache[require.resolve(full)];
			const script = require(full);
			validate(script, file, type);
			script.location = full;
			results.push({ file, script, commandName: script.config.name });
		}
		catch (error) {
			log.error("LOADER", `Could not load ${type} ${file}`, error);
		}
	}
	return results;
}

function createRegistry() {
	return {
		commands: new Map(),
		aliases: new Map(),
		events: [],

		registerCommand(entry) {
			const name = entry.script.config.name.toLowerCase();
			if (this.commands.has(name))
				return `command "${name}" already exists`;
			this.commands.set(name, entry.script);
			this.aliases.set(name, name);
			for (const alias of entry.script.config.aliases || []) {
				const key = String(alias).toLowerCase();
				if (!this.aliases.has(key)) this.aliases.set(key, name);
			}
			return null;
		},

		unregisterCommand(name) {
			const key = String(name || "").toLowerCase();
			const canonical = this.aliases.get(key);
			if (!canonical) return false;
			this.commands.delete(canonical);
			for (const [alias, target] of this.aliases) {
				if (target === canonical) this.aliases.delete(alias);
			}
			return true;
		},

		unregisterEvent(name) {
			const key = String(name || "").toLowerCase();
			const index = this.events.findIndex(script => String(script.config.name).toLowerCase() === key);
			if (index === -1) return false;
			this.events.splice(index, 1);
			return true;
		},

		resolve(name) {
			if (!name) return null;
			const key = String(name).toLowerCase();
			const canonical = this.aliases.get(key);
			return canonical ? this.commands.get(canonical) : null;
		}
	};
}

// Load every .js file from the commands and events directories.
// Idempotent: clears the registry first, so calling it again (e.g. after a
// reconnect retry) reloads fresh instead of stacking duplicate entries.
function loadAll(registry) {
	registry.commands.clear();
	registry.aliases.clear();
	registry.events.length = 0;

	let commandCount = 0;
	let eventCount = 0;

	for (const entry of loadDirectory("commands", "command")) {
		const error = registry.registerCommand(entry);
		if (error) {
			log.warn("LOADER", error);
			continue;
		}
		commandCount++;
	}

	for (const entry of loadDirectory("events", "event")) {
		registry.events.push(entry.script);
		eventCount++;
	}

	log.success("LOADED", `commands: ${commandCount}, events: ${eventCount}`);
	return { commandCount, eventCount };
}

module.exports = { createRegistry, loadAll, loadDirectory, validate };
