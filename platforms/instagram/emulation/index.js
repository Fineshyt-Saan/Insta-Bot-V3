"use strict";

/**
 * platforms/instagram/emulation/index.js
 *
 * Export user-session emulation technology, GraphQL client, and bot builders.
 */

const { UserSessionEmulation, createMessengerBot, createInstagramBot, login } = require("./userSession");
const { BrowserSession } = require("./browserSession");
const { GraphQLClient } = require("./graphQLClient");

module.exports = {
	UserSessionEmulation,
	createMessengerBot,
	createInstagramBot,
	login,
	BrowserSession,
	GraphQLClient
};
