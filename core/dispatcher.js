"use strict";

/**
 * core/dispatcher.js
 *
 * Central Event & Command Router:
 * - Normalizes and deduplicates events.
 * - Enforces spam protection and temporary thread bans.
 * - Enforces whitelist and banned user/thread checks.
 * - Handles prefix and per-thread custom prefix resolution.
 * - Validates role hierarchy and permissions (0=User, 1=Group Admin, 2=Bot Admin, 3=Bot Owner).
 * - Enforces per-command cooldowns.
 * - Dispatches to `onStart` (Floppa/GoatBot format) or `run` (legacy format).
 * - Handles interactive `onReply` and `onReaction` lifecycles.
 * - Provides resilient error boundaries ensuring commands cannot crash the bot.
 */

const { createMessageContext } = require("../platforms/instagram/adapter/messageContext");
const { createSpamMiddleware } = require("./middleware/spamMiddleware");
const { createCooldownMiddleware } = require("./middleware/cooldownMiddleware");
const { Permissions } = require("./permissions/permissions");
const logger = require("../utils/logger");

class Dispatcher {
	constructor(bot) {
		this.bot = bot;
		this.config = bot.config;
		this.permissions = new Permissions(this.config);
		this.spam = createSpamMiddleware(this.config);
		this.cooldowns = createCooldownMiddleware();
		this.processedMessages = new Set();
		this.lastProcessedCleanup = Date.now();
	}

	isProcessed(key) {
		const now = Date.now();
		if (now - this.lastProcessedCleanup > 300000) {
			this.processedMessages.clear();
			this.lastProcessedCleanup = now;
		}
		if (this.processedMessages.has(key)) return true;
		this.processedMessages.add(key);
		return false;
	}

	async dispatch(event) {
		if (!event) return;

		// 1. Self message filter
		if (event.isSelf) return;

		// 2. Anti-inbox check (if configured to ignore direct messages)
		if (this.config.ANTI_INBOX && !event.isGroup) return;

		// 3. Reaction Event Dispatch
		if (event.type === "message_reaction") {
			return await this.handleReaction(event);
		}

		// 4. Membership / Group Action Events
		if (event.type === "join" || event.type === "leave" || event.type === "gc_join" || event.type === "gc_leave") {
			return await this.handleGroupEvent(event);
		}

		// 5. Message & Reply Events
		return await this.handleMessage(event);
	}

	async handleMessage(event) {
		const { threadID, senderID, messageID, timestamp } = event;
		const msgKey = messageID ? `${threadID}-${messageID}` : `${threadID}-${timestamp}`;
		if (this.isProcessed(msgKey)) return;

		const database = global.db || require("../utils/database");

		// Auto-populate user and thread in DB
		const user = database.getUser(senderID);
		if (user) {
			user.messageCount = (user.messageCount || 0) + 1;
			if (!user.name || !user.username) {
				if (this.bot.api && typeof this.bot.api.getUserInfo === "function") {
					this.bot.api.getUserInfo(senderID).then(infoMap => {
						const info = infoMap && (infoMap[senderID] || Object.values(infoMap)[0]);
						if (info) {
							user.name = info.fullName || info.full_name || info.name || user.name || "";
							user.username = info.username || user.username || "";
							user.avatarUrl = info.profilePicUrlHd || info.profile_pic_url_hd || info.profilePicUrl || "";
							database.updateUser(senderID, user);
						}
					}).catch(() => {});
				}
			}
			database.updateUser(senderID, user);
		}

		const threadData = database.getThreadData(threadID);
		if (event.isGroup === false && threadData && threadData.isGroup === undefined) {
			threadData.isGroup = false;
		}

		// Whitelist Checks
		if (this.config.WHITELIST_ENABLE) {
			const allowed = (this.config.WHITELIST_IDS || []).map(String);
			if (!allowed.includes(String(senderID))) return;
		}
		if (this.config.WHITELIST_THREAD_ENABLE) {
			const allowedThreads = (this.config.WHITELIST_THREAD_IDS || []).map(String);
			if (!allowedThreads.includes(String(threadID))) return;
		}

		// Ban Checks
		if (database.isUserBanned && database.isUserBanned(senderID)) {
			if (!this.config.HIDE_NOTI?.userBanned) {
				this.bot.api.sendMessage("🚫 Your account is banned from using this bot.", threadID).catch(() => {});
			}
			return;
		}
		if (database.isThreadBanned && database.isThreadBanned(threadID)) {
			if (!this.config.HIDE_NOTI?.threadBanned) {
				this.bot.api.sendMessage("🚫 This conversation has been banned from using this bot.", threadID).catch(() => {});
			}
			return;
		}

		// Spam Flood Protection
		if (event.isGroup) {
			const spamCheck = this.spam.check(threadID, event.body?.split(/\s+/)[0] || "msg");
			if (spamCheck.isBanned) return;
			if (spamCheck.shouldBan) {
				const banMsg = `⚠️ Command spam flood detected! Group is temporarily muted for ${this.config.SPAM_BAN_DURATION || 24} hours.`;
				await this.bot.api.sendMessage(banMsg, threadID).catch(() => {});
				return;
			}
		}

		// onFirstChat trigger
		if (!global.client) global.client = {};
		if (!global.client.onFirstChat) global.client.onFirstChat = new Set();
		if (!global.client.onFirstChat.has(threadID)) {
			global.client.onFirstChat.add(threadID);
			for (const [, cmd] of this.bot.commandLoader.commands) {
				if (typeof cmd.onFirstChat === "function") {
					cmd.onFirstChat({
						api: this.bot.api,
						event,
						bot: this.bot,
						database,
						usersData: database.usersData,
						threadsData: database.threadsData
					}).catch(err => logger.error("onFirstChat error", { error: err.message }));
				}
			}
		}

		// onChat trigger (runs on every message)
		for (const [, cmd] of this.bot.commandLoader.commands) {
			if (typeof cmd.onChat === "function") {
				cmd.onChat({
					api: this.bot.api,
					event,
					bot: this.bot,
					database,
					usersData: database.usersData,
					threadsData: database.threadsData,
					getLang: (...args) => global.utils ? global.utils.getText(cmd.config?.name || "", ...args) : ""
				}).catch(err => logger.error("onChat error", { error: err.message }));
			}
		}

		// Interactive onReply Routing
		const replyTargetID = event.replyToItemId || (event.messageReply ? event.messageReply.messageID : null);
		if (replyTargetID) {
			const replyHandled = await this.handleReply(event, replyTargetID);
			if (replyHandled) return;
		}

		// Early silent drop for global admin-only / default-off and thread bot-off (Floppa standard)
		const userRole = this.permissions.getUserRole(event.senderID, event.threadID, threadData);
		const isThreadAdminOnly = threadData?.settings?.adminOnly === true || threadData?.settings?.botOff === true || threadData?.adminOnly === true;
		const isGlobalAdminOnly = this.config.ADMIN_ONLY_ENABLE === true || this.config.adminOnly?.enable === true || this.config.defaultOff === true;

		if (isGlobalAdminOnly && userRole < 2) {
			const ignored = (this.config.ADMIN_ONLY_IGNORE_COMMANDS || this.config.adminOnly?.ignoreCommands || []).map(s => s.toLowerCase());
			const p = threadData?.prefix || this.config.PREFIX || "*";
			const cmdName = (event.body || "").trim().startsWith(p) ? (event.body || "").trim().slice(p.length).trim().split(/\s+/)[0]?.toLowerCase() : "";
			if (!cmdName || !ignored.includes(cmdName)) {
				return; // Silently ignore non-admins when global admin-only is on (Floppa standard)
			}
		}

		if (isThreadAdminOnly && userRole < 1) {
			const ignored = (this.config.ADMIN_ONLY_IGNORE_COMMANDS || this.config.adminOnly?.ignoreCommands || []).map(s => s.toLowerCase());
			const p = threadData?.prefix || this.config.PREFIX || "*";
			const cmdName = (event.body || "").trim().startsWith(p) ? (event.body || "").trim().slice(p.length).trim().split(/\s+/)[0]?.toLowerCase() : "";
			if (!cmdName || !ignored.includes(cmdName)) {
				return; // Silently ignore non-admins when thread admin-only is on (Floppa standard)
			}
		}

		// Prefix Resolution
		const globalPrefix = this.config.PREFIX || this.config.prefix || "*";
		const threadPrefix = threadData?.prefix || globalPrefix;
		const body = (event.body || "").trim();

		if (body.toLowerCase() === "prefix") {
			await this.bot.api.sendMessage(
				`🌐 Global prefix: ${globalPrefix}\n🛸 Thread prefix: ${threadPrefix}`,
				threadID
			).catch(() => {});
			return;
		}

		const startsWithGlobal = globalPrefix && body.startsWith(globalPrefix);
		const startsWithThread = threadPrefix && body.startsWith(threadPrefix);
		const activePrefix = startsWithThread ? threadPrefix : (startsWithGlobal ? globalPrefix : null);

		let commandName = "";
		let args = [];

		if (activePrefix) {
			const rawContent = body.slice(activePrefix.length).trim();
			args = rawContent.split(/\s+/);
			commandName = (args.shift() || "").toLowerCase();
		} else {
			// Check if no-prefix execution is allowed (restricted to bot admins or commands opting into noPrefixRole: 0)
			if (body) {
				const candidateArgs = body.split(/\s+/);
				const candidateCmd = candidateArgs[0].toLowerCase();
				const found = this.bot.commandLoader.getCommand(candidateCmd);
				const isDevOrAdmin = userRole >= 2;
				const bareAllowed = !!found && (found.config?.noPrefix === true || found.config?.hasPrefix === false) &&
					(isDevOrAdmin || found.config?.noPrefixRole === 0);
				const globalNoPrefix = (this.config.NO_PREFIX === true || this.config.noPrefix === true) && isDevOrAdmin;
				if (bareAllowed || globalNoPrefix) {
					commandName = candidateCmd;
					args = candidateArgs.slice(1);
				}
			}
		}

		if (!commandName) {
			// Autotalk / AI Fallback for conversational non-commands
			if (threadData?.settings?.autotalk === true && body) {
				const aiCmd = this.bot.commandLoader.getCommand(this.config.AI_FALLBACK?.command || "bby");
				if (aiCmd) {
					return await this.executeCommand(aiCmd, event, body.split(/\s+/), aiCmd.config?.name || "bby", threadPrefix);
				}
			}
			return;
		}

		// Resolve Command
		const command = this.bot.commandLoader.getCommand(commandName);
		if (!command) {
			if (activePrefix && !this.config.HIDE_NOTI?.commandNotFound) {
				const names = this.bot.commandLoader.getAllCommandNames();
				const suggestion = global.utils?.findSimilarCommand ? global.utils.findSimilarCommand(commandName, this.bot.commandLoader.commands) : null;
				let msg = `❌ Unknown command: "${commandName}"\n\n`;
				if (suggestion) msg += `💡 Did you mean: ${threadPrefix}${suggestion}?\n\n`;
				msg += `Type ${threadPrefix}help to see all available commands.`;
				await this.bot.api.sendMessage(msg, threadID).catch(() => {});
			}
			return;
		}

		await this.executeCommand(command, event, args, commandName, threadPrefix);
	}

	async handleReply(event, replyTargetID) {
		const database = global.db || require("../utils/database");
		let replyData = null;

		if (global.GoatBot.onReply) {
			replyData = global.GoatBot.onReply.get(String(replyTargetID));
		}
		if (!replyData && database.getReplyData) {
			replyData = database.getReplyData(replyTargetID);
		}

		// Tap-to-reply fallback: replying directly to a bot message with text
		const botID = this.bot.userID;
		const isReplyToBot = event.messageReply && botID && String(event.messageReply.senderID) === String(botID);
		if (!replyData && isReplyToBot && event.body) {
			replyData = { commandName: "bby", messageID: replyTargetID };
		}

		if (!replyData || !replyData.commandName) return false;

		const command = this.bot.commandLoader.getCommand(replyData.commandName);
		if (!command || (typeof command.onReply !== "function" && typeof command.handleReply !== "function")) {
			return false;
		}

		// Author check: only original caller can reply (unless explicitly permitted)
		if (replyData.author && String(replyData.author) !== String(event.senderID) && !replyData.unsendor) {
			return false;
		}

		const threadData = database.getThreadData(event.threadID);
		const prefix = threadData?.prefix || this.config.PREFIX || "*";
		const message = createMessageContext({ api: this.bot.api, event, command, prefix });
		const args = event.body ? event.body.trim().split(/\s+/) : [];

		const params = {
			api: this.bot.api,
			event,
			args,
			message,
			bot: this.bot,
			commandName: replyData.commandName,
			Reply: replyData,
			replyData,
			database,
			usersData: database.usersData,
			threadsData: database.threadsData,
			prefix,
			utils: global.utils,
			registry: this.bot.commandLoader,
			config: this.config,
			getLang: (...a) => global.utils ? global.utils.getText(replyData.commandName, ...a) : ""
		};

		try {
			if (typeof command.onReply === "function") {
				await command.onReply(params);
			} else {
				await command.handleReply(params);
			}
			return true;
		} catch (err) {
			logger.error(`Error in onReply of ${replyData.commandName}`, { error: err.message });
			await message.reply(`❌ Error in reply handler: ${err.message}`).catch(() => {});
			return true;
		}
	}

	async handleReaction(event) {
		const targetID = event.targetMessageID || event.messageID;
		if (!targetID) return;

		let reactionData = null;
		if (global.GoatBot.onReaction) {
			reactionData = global.GoatBot.onReaction.get(String(targetID));
		}

		if (reactionData && reactionData.commandName) {
			const command = this.bot.commandLoader.getCommand(reactionData.commandName);
			if (command && typeof command.onReaction === "function") {
				const authorMatch = !reactionData.author || String(reactionData.author) === String(event.senderID);
				if (authorMatch) {
					const database = global.db || require("../utils/database");
					const threadData = database.getThreadData(event.threadID);
					const prefix = threadData?.prefix || this.config.PREFIX || "*";
					const message = createMessageContext({ api: this.bot.api, event, command, prefix });

					try {
						await command.onReaction({
							api: this.bot.api,
							event,
							message,
							bot: this.bot,
							Reaction: reactionData,
							reactionData,
							database,
							usersData: database.usersData,
							threadsData: database.threadsData,
							prefix,
							utils: global.utils
						});
					} catch (err) {
						logger.error(`Error in onReaction of ${reactionData.commandName}`, { error: err.message });
					}
				}
			}
		}

		if (this.bot.eventLoader) {
			await this.bot.eventLoader.handleEvent("message_reaction", event, { bot: this.bot }).catch(() => {});
		}

		// Direct reaction unsend handler
		const UNSEND_EMOJIS = ["😡", "😠", "❌", "🗑️", "👎"];
		if (UNSEND_EMOJIS.includes(event.reaction) && event.reactionStatus !== "deleted") {
			const database = global.db || require("../utils/database");
			const threadData = database.getThreadData ? database.getThreadData(event.threadID) : null;
			const userRole = this.permissions.getUserRole(event.senderID, event.threadID, threadData);
			const isDM = !event.isGroup;
			if (userRole >= 1 || isDM) {
				try {
					if (typeof this.bot.api?.unsendMessage === "function") {
						await this.bot.api.unsendMessage(targetID, event.threadID).catch(() => {});
					}
				} catch (_) {}
			}
		}
	}

	async handleGroupEvent(event) {
		// Route group join/leave events to eventLoader
		if (this.bot.eventLoader) {
			await this.bot.eventLoader.handleEvent(event.type, event, { bot: this.bot });
		}
	}

	async executeCommand(command, event, args, commandName, prefix) {
		const database = global.db || require("../utils/database");
		const threadData = database.getThreadData(event.threadID);
		const cfg = command.config || command.meta || {};

		// 1. Thread Admin-Only Check
		const isThreadAdminOnly = threadData?.settings?.adminOnly === true || threadData?.settings?.botOff === true || threadData?.adminOnly === true;
		const isGlobalAdminOnly = this.config.ADMIN_ONLY_ENABLE === true || this.config.adminOnly?.enable === true;

		const userRole = this.permissions.getUserRole(event.senderID, event.threadID, threadData);
		const ignored = (this.config.ADMIN_ONLY_IGNORE_COMMANDS || this.config.adminOnly?.ignoreCommands || []).map(s => s.toLowerCase());

		if (isGlobalAdminOnly && userRole < 2 && !ignored.includes(commandName.toLowerCase())) {
			return; // Silently ignore non-admins when global admin-only is on
		}

		if (isThreadAdminOnly && userRole < 1 && !ignored.includes(commandName.toLowerCase())) {
			return; // Silently ignore non-admins when thread admin-only is on (Floppa standard)
		}

		// 2. Role Check
		const requiredRole = Number(cfg.role) || 0;
		if (userRole < requiredRole) {
			const adminBaseCmds = ["bot", "admin", "adminbot", "botcontrol", "botmode", "togglebot", "cmd", "command", "event", "events", "eventcmd"];
			if (adminBaseCmds.includes(commandName.toLowerCase())) {
				return; // Silently ignore non-admins for admin base commands like Floppa
			}
			if (!this.config.HIDE_NOTI?.needRoleToUseCmd) {
				const roleName = this.permissions.getRoleName(requiredRole);
				await this.bot.api.sendMessage(
					`❌ Access Denied!\n\nThis command requires permission: ${roleName} (${requiredRole})`,
					event.threadID
				).catch(() => {});
			}
			return;
		}

		// 3. Cooldown Check
		const cooldownSec = cfg.countDown != null ? cfg.countDown : (cfg.cooldown || 0);
		if (cooldownSec > 0 && userRole < 2) {
			const cdCheck = this.cooldowns.check(commandName, event.senderID, cooldownSec);
			if (cdCheck.onCooldown) {
				await this.bot.api.sendMessage(
					`⏰ Please wait ${cdCheck.remainingTime}s before using "${commandName}" again.`,
					event.threadID
				).catch(() => {});
				return;
			}
		}

		// 4. Required Money Check
		if (cfg.requiredMoney && cfg.requiredMoney > 0 && database.usersData) {
			const balance = await database.usersData.getMoney(event.senderID);
			if (balance < cfg.requiredMoney) {
				await this.bot.api.sendMessage(
					`💸 You need at least $${cfg.requiredMoney} to use this command (Your balance: $${balance}).`,
					event.threadID
				).catch(() => {});
				return;
			}
		}

		// 5. Build Context and Execute
		const message = createMessageContext({ api: this.bot.api, event, command, prefix });
		const getLang = (...a) => global.utils ? global.utils.getText(cfg.name || commandName, ...a) : "";

		const params = {
			api: this.bot.api,
			event,
			args,
			message,
			commandName: cfg.name || commandName,
			prefix,
			role: userRole,
			isGroup: Boolean(event.isGroup),
			isDM: !event.isGroup,
			bot: this.bot,
			database,
			usersData: database.usersData,
			threadsData: database.threadsData,
			globalData: database.globalData,
			usersDB: database.usersData,
			threadsDB: database.threadsData,
			globalDB: database.globalData,
			money: database.usersData,
			userStat: database.usersData,
			FontSystem: global.utils?.FontSystem,
			fonts: global.utils?.FontSystem?.fonts,
			styler: global.utils,
			utils: global.utils,
			logger,
			config: this.config,
			registry: this.bot.commandLoader,
			PermissionManager: this.permissions,
			getLang,
			removeCommandNameFromBody: (b, p, n) => (b || "").replace(new RegExp(`^${p}(\\s+|)${n}`, "i"), "").trim()
		};

		logger.info(`Command executed: [${cfg.name || commandName}] by ${event.senderID} in ${event.threadID}`);

		try {
			if (typeof command.onStart === "function") {
				await command.onStart(params);
			} else if (typeof command.run === "function") {
				await command.run(params);
			} else if (typeof command.execute === "function") {
				await command.execute(params);
			}

			// Set cooldown after execution
			if (cooldownSec > 0) {
				this.cooldowns.set(commandName, event.senderID);
			}

			// Deduct money if required
			if (cfg.requiredMoney && cfg.requiredMoney > 0 && database.usersData) {
				await database.usersData.subtractMoney(event.senderID, cfg.requiredMoney).catch(() => {});
			}

			// Track stats
			if (database.incrementStat) database.incrementStat("totalCommands");
		} catch (err) {
			logger.error(`Error executing command [${cfg.name || commandName}]`, { error: err.message, stack: err.stack });
			await message.reply(`❌ Command Error: ${err.message}`).catch(() => {});
		}
	}
}

module.exports = { Dispatcher };
