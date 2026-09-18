"use strict";

/**
 * platforms/instagram/index.js
 *
 * Unified Instagram platform entry point.
 */

const { InstagramClient } = require("./adapter/client");
const { createAPIWrapper } = require("./adapter/apiWrapper");
const { createMessageContext } = require("./adapter/messageContext");
const { normalizeEvent } = require("./events/normalizer");
const { getICA } = require("./ica");
const emulation = require("./emulation");

module.exports = {
	InstagramClient,
	createAPIWrapper,
	createMessageContext,
	normalizeEvent,
	getICA,
	...emulation
};
