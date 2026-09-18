"use strict";

/**
 * bot.js — Control bot ON/OFF status and admin-only mode
 *
 * Authors: frnAlt & Floppa Team
 */

module.exports = {
	config: {
		name: "bot",
		aliases: ["botcontrol", "botmode", "togglebot"],
		version: "2.1.0",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		cooldown: 0,
		role: 1,
		category: "config",
		description: { en: "Turn bot ON/OFF or toggle admin-only mode for this chat or globally" },
		usage: { en: "{p}bot [on | off | status | autotalk on/off | global on/off]" }
	},

	onStart: async function ({ message, event, args, config, role, threadData, threadsData, database, PermissionManager, bot, api }) {
		const threadID = String(event.threadId || event.threadID || "");
		const uid = String(event.senderID || event.userID || "").trim();
		const tData = threadData || (database && typeof database.getThreadData === "function" ? database.getThreadData(threadID) : null) || (database && database.threads && typeof database.threads.get === "function" ? database.threads.get(threadID) : null) || {};
		if (!tData.settings) tData.settings = {};

		const isBotAdmin = (role != null && role >= 2) ||
			(config && Array.isArray(config.adminBot) && config.adminBot.map(String).includes(uid)) ||
			(config && Array.isArray(config.ADMIN_BOT) && config.ADMIN_BOT.map(String).includes(uid)) ||
			(config && Array.isArray(config.devUsers) && config.devUsers.map(String).includes(uid)) ||
			(config && Array.isArray(config.DEV_USERS) && config.DEV_USERS.map(String).includes(uid)) ||
			(PermissionManager && typeof PermissionManager.getUserRole === "function" && PermissionManager.getUserRole(uid, threadID, tData) >= 2);

		const rawAdmins = (tData.adminIDs || tData.adminIds || tData.admin_ids || []).map(a => {
			if (!a) return "";
			if (typeof a === "object") return String(a.id || a.userID || a.pk || a.uid || "").trim();
			return String(a).trim();
		}).filter(Boolean);

		const isThreadAdmin = isBotAdmin || (role != null && role >= 1) ||
			(event.isGroup === false) ||
			rawAdmins.includes(uid) ||
			(PermissionManager && typeof PermissionManager.getUserRole === "function" && PermissionManager.getUserRole(uid, threadID, tData) >= 1);

		// Non-admins cannot use bot command by default, do not send any output (Floppa standard)
		if (!isThreadAdmin) {
			return;
		}

		function saveThreadData() {
			if (threadsData && typeof threadsData.set === "function") {
				threadsData.set(threadID, tData);
			}
			if (database && typeof database.setThreadData === "function") {
				database.setThreadData(threadID, tData);
			}
			if (database && database.threads && typeof database.threads.set === "function") {
				database.threads.set(threadID, tData);
			}
			if (database && database.threads && typeof database.threads.update === "function") {
				database.threads.update(threadID, tData);
			}
			if (database && typeof database.save === "function") {
				database.save();
			}
			if (database && typeof database.flush === "function") {
				database.flush();
			}
			if (database && database.threads && typeof database.threads.flush === "function") {
				database.threads.flush();
			}
		}

		const subCmd = args[0] ? args[0].toLowerCase() : "status";
		const p = (config && (config.prefix || config.PREFIX)) || "*";

		// 1. Global toggle / Default-Off (Bot Admin only)
		if (subCmd === "global" || subCmd === "defaultoff" || subCmd === "default-off") {
			if (!isBotAdmin) {
				return;
			}
			const gMode = args[1] ? args[1].toLowerCase() : null;
			if (gMode === "off" || gMode === "disable" || gMode === "admin" || (subCmd.includes("default") && gMode !== "off" && gMode !== "enable")) {
				if (config.adminOnly) config.adminOnly.enable = true;
				config.ADMIN_ONLY_ENABLE = true;
				config.defaultOff = true;
				try { require("../src/config").saveConfig(config); } catch (_) {}
				return message.reply("🔒 Global Bot Status: DISABLED for non-admins (Admin-Only / Default-OFF mode activated globally).");
			}
			if (gMode === "on" || gMode === "enable" || gMode === "public") {
				if (config.adminOnly) config.adminOnly.enable = false;
				config.ADMIN_ONLY_ENABLE = false;
				config.defaultOff = false;
				try { require("../src/config").saveConfig(config); } catch (_) {}
				return message.reply("✅ Global Bot Status: ENABLED globally for all users.");
			}
			const isGlobalOn = Boolean((config.adminOnly && config.adminOnly.enable) || config.ADMIN_ONLY_ENABLE || config.defaultOff);
			return message.reply(`🌐 Global Bot Mode: ${isGlobalOn ? "ADMIN-ONLY / DEFAULT-OFF 🔒" : "PUBLIC ✅"}\nUsage: ${p}bot global [on | off]`);
		}

		// 2. Turn Bot OFF for non-admins (Admins can still use all commands)
		if (subCmd === "off" || subCmd === "disable" || subCmd === "admin" || subCmd === "adminonly") {
			if (!isThreadAdmin) return;
			tData.adminOnly = true;
			tData.settings.adminOnly = true;
			tData.settings.botOff = true;
			saveThreadData();
			return message.reply("🔒 Bot has been turned OFF for non-admins in this chat!\nAdmins can still use all commands.");
		}

		// 3. Turn Bot ON for everyone in this chat
		if (subCmd === "on" || subCmd === "enable" || subCmd === "public") {
			if (!isThreadAdmin) return;
			tData.adminOnly = false;
			tData.settings.adminOnly = false;
			tData.settings.botOff = false;
			saveThreadData();
			return message.reply("✅ Bot has been turned ON for all users in this chat!");
		}

		// 4. Toggle Auto-Talk
		if (subCmd === "autotalk" || subCmd === "talk" || subCmd === "atalk") {
			const mode = args[1] ? args[1].toLowerCase() : null;
			if (mode === "on" || mode === "enable") {
				if (!isThreadAdmin) return;
				tData.autotalk = true;
				tData.settings.autotalk = true;
				saveThreadData();
				return message.reply("🗣️ Auto-Talk Chatbot has been ENABLED for this chat!");
			}
			if (mode === "off" || mode === "disable") {
				if (!isThreadAdmin) return;
				tData.autotalk = false;
				tData.settings.autotalk = false;
				saveThreadData();
				return message.reply("🔇 Auto-Talk Chatbot has been DISABLED for this chat.");
			}
			const atState = tData.autotalk === true || tData.settings.autotalk === true;
			return message.reply(`🗣️ Auto-Talk Status: ${atState ? "ENABLED ✅" : "DISABLED ❌"}\nUsage: ${p}bot autotalk [on | off]`);
		}

		// 5. Toggle Events (Welcome/Leave notifications)
		if (subCmd === "event" || subCmd === "events") {
			const mode = args[1] ? args[1].toLowerCase() : null;
			if (mode === "off" || mode === "disable") {
				if (!isThreadAdmin) return;
				tData.eventsOff = true;
				tData.settings.eventsOff = true;
				saveThreadData();
				return message.reply("🔇 Event notifications (welcome/leave) have been DISABLED for this chat.");
			}
			if (mode === "on" || mode === "enable") {
				if (!isThreadAdmin) return;
				tData.eventsOff = false;
				tData.settings.eventsOff = false;
				saveThreadData();
				return message.reply("🔔 Event notifications (welcome/leave) have been ENABLED for this chat.");
			}
			const evState = !(tData.eventsOff === true || tData.settings.eventsOff === true);
			return message.reply(`🔔 Events Status: ${evState ? "ENABLED ✅" : "DISABLED ❌"}\nUsage: ${p}bot events [on | off]`);
		}

		// 6. Show Bot Status panel
		const isBotOff = tData.adminOnly === true || tData.settings.adminOnly === true || tData.settings.botOff === true;
		const isGlobalOff = Boolean((config.adminOnly && config.adminOnly.enable === true) || config.ADMIN_ONLY_ENABLE === true || config.defaultOff === true);
		const autoTalkState = tData.autotalk === true || tData.settings.autotalk === true;
		const eventsState = !(tData.eventsOff === true || tData.settings.eventsOff === true);

		let statusMsg = "🤖 Bot Status Control Panel\n\n";
		statusMsg += `📍 Chat Status: ${isBotOff ? "OFF 🔒 (Admin Only)" : "ON ✅ (Public)"}\n`;
		statusMsg += `🌐 Global Status: ${isGlobalOff ? "ADMIN ONLY 🔒" : "ACTIVE ✅"}\n`;
		statusMsg += `🗣️ Auto-Talk AI: ${autoTalkState ? "ON ✅" : "OFF ❌"}\n`;
		statusMsg += `🔔 Events/Alerts: ${eventsState ? "ON ✅" : "OFF ❌"}\n\n`;
		statusMsg += "🛠️ Admin Usage:\n";
		statusMsg += `• ${p}bot off — Turn bot OFF for non-admins (Admin Only)\n`;
		statusMsg += `• ${p}bot on — Turn bot ON for everyone\n`;
		statusMsg += `• ${p}bot events [on|off] — Toggle welcome/leave events\n`;
		statusMsg += `• ${p}bot autotalk [on|off] — Toggle AI chatbot auto-talk\n`;
		statusMsg += `• ${p}bot global [on|off] — Global bot toggle (Bot Admin)`;

		return message.reply(statusMsg);
	},

	run: async function (params) {
		return module.exports.onStart(params);
	}
};
