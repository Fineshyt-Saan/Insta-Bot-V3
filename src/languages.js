"use strict";

/**
 * Language loading + text lookup.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");

const LANGS_DIR = path.resolve(__dirname, "..", "languages");
const cache = {};

function load(lang) {
	if (cache[lang]) return cache[lang];
	const file = path.join(LANGS_DIR, `${lang}.js`);
	if (!fs.existsSync(file)) {
		if (lang !== "en") return load("en");
		return {};
	}
	delete require.cache[require.resolve(file)];
	const loaded = require(file);
	cache[lang] = loaded;
	return loaded;
}

function text(lang, key, ...args) {
	const table = load(lang);
	const template = (table && table[key]) || (load("en") || {})[key] || `[missing text: ${key}]`;
	return template.replace(/%(\d+)/g, (match, index) => {
		const value = args[Number(index) - 1];
		return value == null ? "" : String(value);
	});
}

module.exports = { load, text, LANGS_DIR };
