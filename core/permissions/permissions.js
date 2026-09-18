"use strict";

/**
 * core/permissions/permissions.js
 *
 * Role Hierarchy:
 *   0: Member (default user)
 *   1: Thread Admin / Group Moderator
 *   2: Bot Admin (config.ADMIN_BOT)
 *   3: Bot Owner / Developer (config.DEV_USERS)
 */

class Permissions {
	constructor(config = {}) {
		this.config = config;
		this.adminBot = [
			...(Array.isArray(config.ADMIN_BOT) ? config.ADMIN_BOT : []),
			...(Array.isArray(config.adminBot) ? config.adminBot : [])
		].map(String).map(s => s.trim()).filter(Boolean);

		this.devUsers = [
			...(Array.isArray(config.DEV_USERS) ? config.DEV_USERS : []),
			...(Array.isArray(config.devUsers) ? config.devUsers : [])
		].map(String).map(s => s.trim()).filter(Boolean);
	}

	getUserRole(userID, threadID, threadData = null) {
		const uid = String(userID || "").trim();
		if (!uid) return 0;

		// 1. Bot Owner / Developer
		const devList = [
			...(Array.isArray(this.config.DEV_USERS) ? this.config.DEV_USERS : []),
			...(Array.isArray(this.config.devUsers) ? this.config.devUsers : []),
			...this.devUsers
		].map(String).map(s => s.trim()).filter(Boolean);

		if (devList.includes(uid)) {
			return 3;
		}

		// 2. Bot Admin
		const adminList = [
			...(Array.isArray(this.config.ADMIN_BOT) ? this.config.ADMIN_BOT : []),
			...(Array.isArray(this.config.adminBot) ? this.config.adminBot : []),
			...this.adminBot
		].map(String).map(s => s.trim()).filter(Boolean);

		if (adminList.includes(uid)) {
			return 2;
		}

		// 3. Direct Message (DM) check: in private chat (non-group), user is thread admin (role 1)
		if (threadData && threadData.isGroup === false) {
			return 1;
		}
		if (threadID && String(threadID) === uid) {
			return 1;
		}

		// 4. Thread Admin / Group Moderator
		if (threadData) {
			const rawAdmins = threadData.adminIDs || threadData.adminIds || threadData.admin_ids || [];
			const adminIDs = (Array.isArray(rawAdmins) ? rawAdmins : []).map(a => {
				if (!a) return "";
				if (typeof a === "object") return String(a.id || a.userID || a.pk || a.uid || "").trim();
				return String(a).trim();
			}).filter(Boolean);
			if (adminIDs.includes(uid)) {
				return 1;
			}
		}

		// 5. Default user
		return 0;
	}

	hasPermission(roleRequired, userRole) {
		const required = Number(roleRequired) || 0;
		const current = Number(userRole) || 0;
		return current >= required;
	}

	getRoleName(role) {
		switch (Number(role)) {
			case 3: return "Bot Owner";
			case 2: return "Bot Admin";
			case 1: return "Thread Admin";
			default: return "User";
		}
	}
}

function getPermissionLevel(userID, threadAdmins = [], config = {}) {
	const p = new Permissions(config);
	return p.getUserRole(userID, null, { adminIDs: threadAdmins });
}

function checkPermission(userRole, roleRequired) {
	return (Number(userRole) || 0) >= (Number(roleRequired) || 0);
}

module.exports = { Permissions, getPermissionLevel, checkPermission };
