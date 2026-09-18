"use strict";

/**
 * config.js — Manage bot and thread configuration settings
 *
 * Authors: 𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍
 */

const { saveConfig, loadConfig } = require("../src/config");

module.exports = {
	config: {
		name: "config",
		aliases: ["settings", "botconfig", "setconfig", "cfg"],
		version: "2.0.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		cooldown: 0,
		role: 0,
		category: "config",
		description: { en: "View and manage bot and thread configuration settings" },
		usage: { en: "{p}config [view | prefix | name | lang | autotalk | adminonly | welcome | leave | reload]" }
	},

	onStart: async function ({ message, event, args, config, role, threadData, threadsData, database, PermissionManager }) {
		const threadID = event.threadId || event.threadID;
		const uid = String(event.senderID || event.userID || "");
		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || {};
		if (!tData.settings) tData.settings = {};

		const isBotAdmin = (role != null && role >= 2) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid)) ||
			(PermissionManager && typeof PermissionManager.getUserRole === "function" && PermissionManager.getUserRole(uid, threadID, tData) >= 2);

		const isThreadAdmin = isBotAdmin || (role != null && role >= 1) ||
			(event.isGroup === false) ||
			(Array.isArray(tData.adminIDs) && tData.adminIDs.map(a => String(a.id || a.userID || a)).includes(uid)) ||
			(PermissionManager && typeof PermissionManager.getUserRole === "function" && PermissionManager.getUserRole(uid, threadID, tData) >= 1);

		function saveThread() {
			if (threadsData && typeof threadsData.set === "function") threadsData.set(threadID, tData);
			if (database && typeof database.setThreadData === "function") database.setThreadData(threadID, tData);
			if (database && typeof database.save === "function") database.save();
		}

		const action = (args[0] || "").toLowerCase();
		const p = (config && (config.prefix || config.PREFIX)) || "*";

		// 1. Reload config from disk (Bot Admin only)
		if (action === "reload" || action === "load") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can reload configuration.");
			try {
				const fresh = loadConfig();
				Object.assign(config, fresh);
				return message.reply("✅ Configuration reloaded successfully from disk.");
			} catch (err) {
				return message.reply(`❌ Failed to reload config: ${err.message}`);
			}
		}

		// 2. Set Prefix (Thread or Global)
		if (action === "prefix" || action === "setprefix") {
			if (!args[1]) {
				const currentPrefix = tData.prefix || config.prefix;
				return message.reply(`📍 Current Prefix: "${currentPrefix}"\n\nUsage:\n• ${p}config prefix <newPrefix> (this chat)\n• ${p}config prefix <newPrefix> --global (all chats, Bot Admin)`);
			}
			const newPrefix = args[1].trim();
			if (newPrefix.length > 3) return message.reply("❌ The prefix must be 1 to 3 characters.");
			const isGlobal = args.includes("--global") || args.includes("-g");

			if (isGlobal) {
				if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can set the global prefix.");
				config.prefix = newPrefix;
				saveConfig(config);
				return message.reply(`✅ Global prefix updated to: "${newPrefix}"`);
			} else {
				if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can change this chat's prefix.");
				tData.prefix = newPrefix;
				saveThread();
				return message.reply(`✅ Custom prefix for this chat updated to: "${newPrefix}"`);
			}
		}

		// 3. Set Bot Name (Bot Admin only)
		if (action === "name" || action === "botname") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can change the bot name.");
			const newName = args.slice(1).join(" ").trim();
			if (!newName) return message.reply(`Usage: ${p}config name <NewBotName>`);
			config.botName = newName;
			saveConfig(config);
			return message.reply(`✅ Bot name updated to: "${newName}"`);
		}

		// 4. Set Language (Bot Admin only)
		if (action === "lang" || action === "language") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can change bot language.");
			const newLang = (args[1] || "").toLowerCase();
			if (!["en", "vi"].includes(newLang)) return message.reply(`Usage: ${p}config lang <en | vi>`);
			config.language = newLang;
			saveConfig(config);
			return message.reply(`✅ Bot language set to: "${newLang.toUpperCase()}"`);
		}

		// 5. Admin-Only Mode (Thread or Global)
		if (action === "adminonly" || action === "admin") {
			const isGlobal = args.includes("--global") || args.includes("-g");
			const state = (args[1] || "").toLowerCase();

			if (isGlobal) {
				if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can toggle global admin-only mode.");
				if (state === "on" || state === "enable") {
					if (config.adminOnly) config.adminOnly.enable = true;
					config.ADMIN_ONLY_ENABLE = true;
					saveConfig(config);
					return message.reply("🔒 Global Admin-Only mode ENABLED (Non-admins cannot use the bot).");
				}
				if (state === "off" || state === "disable") {
					if (config.adminOnly) config.adminOnly.enable = false;
					config.ADMIN_ONLY_ENABLE = false;
					saveConfig(config);
					return message.reply("✅ Global Admin-Only mode DISABLED (Public access enabled).");
				}
				const isGlobalOn = (config.adminOnly && config.adminOnly.enable) || config.ADMIN_ONLY_ENABLE;
				return message.reply(`🌐 Global Admin-Only Status: ${isGlobalOn ? "ON 🔒" : "OFF ✅"}\nUsage: ${p}config adminonly [on | off] --global`);
			} else {
				if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can change chat admin-only mode.");
				if (state === "on" || state === "enable") {
					tData.adminOnly = true;
					tData.settings.adminOnly = true;
					tData.settings.botOff = true;
					saveThread();
					return message.reply("🔒 Chat Admin-Only mode ENABLED (Admins can still use all commands).");
				}
				if (state === "off" || state === "disable") {
					tData.adminOnly = false;
					tData.settings.adminOnly = false;
					tData.settings.botOff = false;
					saveThread();
					return message.reply("✅ Chat Admin-Only mode DISABLED (All members can use commands).");
				}
				const isChatOff = tData.adminOnly || tData.settings.adminOnly || tData.settings.botOff;
				return message.reply(`📍 Chat Admin-Only Status: ${isChatOff ? "ON 🔒" : "OFF ✅"}\nUsage: ${p}config adminonly [on | off]`);
			}
		}

		// 6. Auto-Talk Chatbot Mode
		if (action === "autotalk" || action === "talk") {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can toggle auto-talk.");
			const state = (args[1] || "").toLowerCase();
			if (state === "on" || state === "enable") {
				tData.autotalk = true;
				tData.settings.autotalk = true;
				saveThread();
				return message.reply("🗣️ Auto-Talk Chatbot has been ENABLED for this chat!");
			}
			if (state === "off" || state === "disable") {
				tData.autotalk = false;
				tData.settings.autotalk = false;
				saveThread();
				return message.reply("🔇 Auto-Talk Chatbot has been DISABLED for this chat.");
			}
			const atState = tData.autotalk === true || tData.settings.autotalk === true;
			return message.reply(`🗣️ Auto-Talk Status: ${atState ? "ENABLED ✅" : "DISABLED ❌"}\nUsage: ${p}config autotalk [on | off]`);
		}

		// 7. Welcome Greetings
		if (action === "welcome") {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can toggle welcome greetings.");
			const state = (args[1] || "").toLowerCase();
			if (state === "on" || state === "enable") {
				tData.settings.welcome = true;
				saveThread();
				return message.reply("👋 Welcome greetings ENABLED for new members!");
			}
			if (state === "off" || state === "disable") {
				tData.settings.welcome = false;
				saveThread();
				return message.reply("❌ Welcome greetings DISABLED for new members.");
			}
			const wState = tData.settings.welcome !== false && config.welcome?.enable !== false;
			return message.reply(`👋 Welcome Greetings: ${wState ? "ENABLED ✅" : "DISABLED ❌"}\nUsage: ${p}config welcome [on | off]`);
		}

		// 8. Leave Alerts
		if (action === "leave") {
			if (!isThreadAdmin) return message.reply("❌ Only Chat or Bot Admins can toggle leave alerts.");
			const state = (args[1] || "").toLowerCase();
			if (state === "on" || state === "enable") {
				tData.settings.leave = true;
				saveThread();
				return message.reply("👋 Leave alerts ENABLED when members leave!");
			}
			if (state === "off" || state === "disable") {
				tData.settings.leave = false;
				saveThread();
				return message.reply("❌ Leave alerts DISABLED when members leave.");
			}
			const lState = tData.settings.leave !== false && config.leave?.enable !== false;
			return message.reply(`👋 Leave Alerts: ${lState ? "ENABLED ✅" : "DISABLED ❌"}\nUsage: ${p}config leave [on | off]`);
		}

		// 9. Anti-Inbox Mode (Bot Admin only)
		if (action === "antiinbox") {
			if (!isBotAdmin) return message.reply("🔒 Only Bot Admins can toggle anti-inbox mode.");
			const state = (args[1] || "").toLowerCase();
			if (state === "on" || state === "enable") {
				config.antiInbox = true;
				saveConfig(config);
				return message.reply("🚫 Anti-Inbox mode ENABLED (Bot ignores private DMs).");
			}
			if (state === "off" || state === "disable") {
				config.antiInbox = false;
				saveConfig(config);
				return message.reply("✅ Anti-Inbox mode DISABLED (Private DMs allowed).");
			}
			return message.reply(`🚫 Anti-Inbox Status: ${config.antiInbox ? "ON 🔒" : "OFF ✅"}\nUsage: ${p}config antiinbox [on | off]`);
		}

		// 10. Default / View Status Panel
		const isChatAdminOnly = tData.adminOnly === true || tData.settings.adminOnly === true || tData.settings.botOff === true;
		const isGlobalAdminOnly = Boolean((config.adminOnly && config.adminOnly.enable) || config.ADMIN_ONLY_ENABLE);
		const autoTalkState = Boolean(tData.autotalk === true || tData.settings.autotalk === true);
		const welcomeState = Boolean(tData.settings.welcome !== false && config.welcome?.enable !== false);
		const leaveState = Boolean(tData.settings.leave !== false && config.leave?.enable !== false);
		const currentPrefix = tData.prefix || config.prefix;

		let msg = "⚙️ 𝗕𝗢𝗧 & 𝗖𝗛𝗔𝗧 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗧𝗜𝗢𝗡 ⚙️\n\n";
		msg += `🤖 Bot Name: ${config.botName || "InstaBOT"}\n`;
		msg += `📍 Active Prefix: "${currentPrefix}" ${tData.prefix ? "(Chat Custom)" : "(Global)"}\n`;
		msg += `🌐 Language: ${(config.language || "en").toUpperCase()}\n`;
		msg += `🔒 Global Admin-Only: ${isGlobalAdminOnly ? "ON 🔒" : "OFF ✅"}\n`;
		msg += `🔒 Chat Admin-Only: ${isChatAdminOnly ? "ON 🔒 (Admins only)" : "OFF ✅ (Public)"}\n`;
		msg += `🗣️ Auto-Talk AI: ${autoTalkState ? "ON 🗣️" : "OFF 🔇"}\n`;
		msg += `👋 Welcome Messages: ${welcomeState ? "ON 👋" : "OFF ❌"}\n`;
		msg += `👋 Leave Alerts: ${leaveState ? "ON 👋" : "OFF ❌"}\n`;
		msg += `👑 Bot Admins: ${config.adminBot ? config.adminBot.length : 0} configured\n\n`;

		msg += "🛠️ 𝗖𝗢𝗡𝗙𝗜𝗚 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦:\n";
		msg += `• ${p}config prefix <val> [--global]\n`;
		msg += `• ${p}config name <name> (Bot Admin)\n`;
		msg += `• ${p}config lang <en|vi> (Bot Admin)\n`;
		msg += `• ${p}config adminonly [on|off] [--global]\n`;
		msg += `• ${p}config autotalk [on|off]\n`;
		msg += `• ${p}config welcome [on|off]\n`;
		msg += `• ${p}config leave [on|off]\n`;
		msg += `• ${p}config antiinbox [on|off]\n`;
		msg += `• ${p}config reload (Bot Admin)`;

		return message.reply(msg);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
