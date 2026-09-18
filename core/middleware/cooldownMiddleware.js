"use strict";

/**
 * core/middleware/cooldownMiddleware.js
 *
 * Command cooldown management.
 */

const cooldownManager = require("../../func/cooldownManager");

function createCooldownMiddleware() {
	return {
		check(commandName, senderID, cooldownSeconds) {
			const ms = (Number(cooldownSeconds) || 1) * 1000;
			return cooldownManager.checkCooldown(commandName, senderID, ms);
		},
		set(commandName, senderID) {
			cooldownManager.setCooldown(commandName, senderID);
		},
		clear() {
			cooldownManager.clear();
		},
		manager: cooldownManager
	};
}

module.exports = { createCooldownMiddleware };
