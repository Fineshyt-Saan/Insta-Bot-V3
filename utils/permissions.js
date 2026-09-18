const ConfigManager = require('./configManager');
const logger = require('./logger');

class PermissionManager {
  static isGroupAdmin(userId, threadInfo) {
    if (!threadInfo) return false;
    const uid = String(userId);
    if (Array.isArray(threadInfo.adminIDs)) {
      return threadInfo.adminIDs.some(a => (typeof a === 'object' ? String(a.uid || a.id || '') : String(a)) === uid);
    }
    if (Array.isArray(threadInfo.adminParticipants)) {
      return threadInfo.adminParticipants.some(a => String(a.userID || a.uid || a) === uid);
    }
    return false;
  }

  static getGlobalRole(userId) {
    const uid = String(userId);
    if (ConfigManager.getDevUsers().includes(uid))     return 4;
    if (ConfigManager.getAdmins().includes(uid))       return 2;
    if (ConfigManager.getPremiumUsers().includes(uid)) return 3;
    return 0;
  }

  static getUserRole(userId, threadInfo = null) {
    const g = this.getGlobalRole(userId);
    if (g !== 0) return g;
    if (this.isGroupAdmin(userId, threadInfo)) return 1;
    return 0;
  }

  static async hasPermission(userId, requiredRole = 0, threadInfo = null) {
    if (requiredRole === 0) return true;
    const g = this.getGlobalRole(userId);
    if (g === 4) return true;
    switch (requiredRole) {
      case 1: return g === 2 || g === 3 || this.isGroupAdmin(userId, threadInfo);
      case 2: return g === 2;
      case 3: return g === 3 || g === 2;
      case 4: return false;
      default: return false;
    }
  }

  static getRoleName(role) {
    return { 0: 'Normal User', 1: 'Group Administrator', 2: 'Bot Admin', 3: 'Premium User', 4: 'Bot Developer' }[role] ?? 'Unknown';
  }

  static canUseNoPrefix(userId) {
    const g = this.getGlobalRole(userId);
    return g === 2 || g === 4;
  }
}

module.exports = PermissionManager;
