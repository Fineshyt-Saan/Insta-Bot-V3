/**
 * Optimized Cooldown Manager with TTL and automatic cleanup
 * Adapted from Floppa-Chatbot
 */

class CooldownManager {
	constructor(options = {}) {
		this.options = {
			defaultCooldown: options.defaultCooldown || 1000,
			cleanupInterval: options.cleanupInterval || 60000,
			maxEntries: options.maxEntries || 10000,
			...options
		};

		this.cooldowns = new Map();
		this.stats = { totalChecks: 0, blocked: 0, allowed: 0, cleanups: 0 };
		this.cleanupTimer = setInterval(() => this._cleanup(), this.options.cleanupInterval);
		if (this.cleanupTimer.unref) this.cleanupTimer.unref();
	}

	checkCooldown(commandName, senderID, customCooldown = null) {
		this.stats.totalChecks++;
		const cooldown = customCooldown != null ? customCooldown : this.options.defaultCooldown;
		const now = Date.now();

		let commandCooldowns = this.cooldowns.get(commandName);
		if (!commandCooldowns) {
			this.stats.allowed++;
			return { onCooldown: false, remainingTime: 0 };
		}

		const timestamp = commandCooldowns.get(senderID);
		if (!timestamp) {
			this.stats.allowed++;
			return { onCooldown: false, remainingTime: 0 };
		}

		const expirationTime = timestamp + cooldown;
		if (now < expirationTime) {
			this.stats.blocked++;
			return {
				onCooldown: true,
				remainingTime: Math.ceil((expirationTime - now) / 1000)
			};
		}

		commandCooldowns.delete(senderID);
		this.stats.allowed++;
		return { onCooldown: false, remainingTime: 0 };
	}

	setCooldown(commandName, senderID) {
		let commandCooldowns = this.cooldowns.get(commandName);
		if (!commandCooldowns) {
			commandCooldowns = new Map();
			this.cooldowns.set(commandName, commandCooldowns);
		}
		commandCooldowns.set(senderID, Date.now());
		this._checkMaxEntries();
	}

	getStats() {
		let totalEntries = 0;
		for (const commandCooldowns of this.cooldowns.values()) {
			totalEntries += commandCooldowns.size;
		}
		return { ...this.stats, totalEntries, commandCount: this.cooldowns.size };
	}

	clear() {
		this.cooldowns.clear();
	}

	destroy() {
		clearInterval(this.cleanupTimer);
		this.clear();
	}

	_cleanup() {
		const now = Date.now();
		let cleaned = 0;

		for (const [commandName, commandCooldowns] of this.cooldowns) {
			for (const [senderID, timestamp] of commandCooldowns) {
				if (now - timestamp > 300000) {
					commandCooldowns.delete(senderID);
					cleaned++;
				}
			}
			if (commandCooldowns.size === 0) {
				this.cooldowns.delete(commandName);
			}
		}
		if (cleaned > 0) this.stats.cleanups += cleaned;
		return cleaned;
	}

	_checkMaxEntries() {
		let totalEntries = 0;
		for (const commandCooldowns of this.cooldowns.values()) {
			totalEntries += commandCooldowns.size;
		}
		if (totalEntries > this.options.maxEntries) {
			this._cleanup();
		}
	}
}

const cooldownManager = new CooldownManager();
module.exports = cooldownManager;
