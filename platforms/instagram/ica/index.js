"use strict";

/**
 * platforms/instagram/ica/index.js
 *
 * Resolves the appropriate Instagram Chat API implementation:
 * - If config.server.url and config.server.token (or IG_API_SERVER & IG_API_TOKEN) are provided,
 *   it uses the remote RPC/SSE client (lazyneoaz/Insta-Bot).
 * - Otherwise, it uses the embedded direct local ICA engine (ica-by-tanvir).
 */

const remoteAuth = require("./remoteAuth");

function getICA(config = {}) {
	const server = config.server || {};
	const serverUrl = server.url || process.env.IG_API_SERVER;
	const serverToken = server.token || process.env.IG_API_TOKEN;

	if (serverUrl && serverToken) {
		return {
			mode: "remote",
			login: remoteAuth,
			CookieUtils: null
		};
	}

	if (config.mode === "emulation" || config.useEmulation) {
		const emulation = require("../emulation");
		return {
			mode: "emulation",
			login: emulation.login,
			CookieUtils: null,
			raw: emulation
		};
	}

	// Default to direct local ICA engine
	const localIca = require("../../../ica");
	return {
		mode: "direct",
		login: localIca.login || localIca,
		CookieUtils: localIca.CookieUtils,
		setOptions: localIca.setOptions,
		raw: localIca
	};
}

module.exports = { getICA };
