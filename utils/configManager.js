const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ConfigManager {
  static configPath = path.resolve(__dirname, '../config/default.json');

  static loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      return {};
    } catch (e) { logger.error('Error loading config', { error: e.message }); return {}; }
  }

  static saveConfig(cfg) {
    try { fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf-8'); return true; }
    catch (e) { logger.error('Error saving config', { error: e.message }); return false; }
  }

  static getAdmins()       { return this.loadConfig().adminBot     || []; }
  static getPremiumUsers() { return this.loadConfig().premiumUsers  || []; }
  static getDevUsers()     { return this.loadConfig().devUsers      || []; }
  static isAdmin(uid)      { return this.getAdmins().includes(String(uid)); }
  static isDev(uid)        { return this.getDevUsers().includes(String(uid)); }
  static getDeveloper()    { return this.getDevUsers()[0] || ''; }

  static addAdmin(uid) {
    const cfg = this.loadConfig();
    if (!cfg.adminBot) cfg.adminBot = [];
    if (cfg.adminBot.includes(String(uid))) return false;
    cfg.adminBot.push(String(uid));
    return this.saveConfig(cfg);
  }

  static removeAdmin(uid) {
    const cfg = this.loadConfig();
    if (!cfg.adminBot) return false;
    const idx = cfg.adminBot.indexOf(String(uid));
    if (idx === -1) return false;
    if (cfg.devUsers && cfg.devUsers.includes(String(uid))) return false;
    cfg.adminBot.splice(idx, 1);
    return this.saveConfig(cfg);
  }

  static addPremiumUser(uid) {
    const cfg = this.loadConfig();
    if (!cfg.premiumUsers) cfg.premiumUsers = [];
    if (cfg.premiumUsers.includes(String(uid))) return false;
    cfg.premiumUsers.push(String(uid));
    return this.saveConfig(cfg);
  }

  static removePremiumUser(uid) {
    const cfg = this.loadConfig();
    if (!cfg.premiumUsers) return false;
    const idx = cfg.premiumUsers.indexOf(String(uid));
    if (idx === -1) return false;
    cfg.premiumUsers.splice(idx, 1);
    return this.saveConfig(cfg);
  }

  static updateConfig(key, value) {
    const cfg = this.loadConfig();
    cfg[key] = value;
    return this.saveConfig(cfg);
  }

  static get config() {
      return this.loadConfig();
  }
}

module.exports = ConfigManager;
