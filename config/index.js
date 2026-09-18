'use strict';

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

let c = {};
const configPath = path.resolve(__dirname, 'default.json');

try {
  if (fs.existsSync(configPath)) {
    c = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (error) {
  console.error('Error loading config/default.json:', error.message);
}

const pkg = (() => {
  try { return require('../package.json'); } catch (_) { return {}; }
})();

module.exports = {
  BOT_NAME:    c.nickNameBot || 'InstaBOT',
  BOT_VERSION: pkg.version   || '1.0.0',
  AUTHOR:      pkg.author    || 'Gtajisan && frnAlt',

  ACCOUNT_EMAIL:    process.env.ACCOUNT_EMAIL    || c.instagramAccount?.email    || '',
  ACCOUNT_PASSWORD: process.env.ACCOUNT_PASSWORD || c.instagramAccount?.password || '',
  ACCOUNT_2FA_SECRET: c.instagramAccount?.['2FASecret'] || '',
  ACCOUNT_I_USER:   c.instagramAccount?.i_user || '',
  ACCOUNT_PROXY:    c.instagramAccount?.proxy   || null,
  ACCOUNT_USER_AGENT: process.env.ACCOUNT_USER_AGENT || c.instagramAccount?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  INTERVAL_GET_NEW_COOKIE: c.instagramAccount?.intervalGetNewCookie ?? 1440,

  ANTI_INBOX:   c.antiInbox   ?? false,
  LANGUAGE:     c.language    || 'en',
  NICK_NAME_BOT: c.nickNameBot || 'InstaBOT',
  PREFIX:       process.env.PREFIX || c.prefix || '!',
  NO_PREFIX:    c.noPrefix ?? true,

  ADMIN_ONLY_ENABLE:          c.adminOnly?.enable ?? false,
  ADMIN_ONLY_IGNORE_COMMANDS: c.adminOnly?.ignoreCommand || [],

  ADMIN_BOT:     c.adminBot     || [],
  PREMIUM_USERS: c.premiumUsers || [],
  DEV_USERS:     c.devUsers     || [],

  WHITELIST_ENABLE: c.whiteListMode?.enable ?? false,
  WHITELIST_IDS:    c.whiteListMode?.whiteListIds || [],

  WHITELIST_THREAD_ENABLE:    c.whiteListModeThread?.enable ?? false,
  WHITELIST_THREAD_IDS:       c.whiteListModeThread?.whiteListThreadIds || [],

  DATABASE_TYPE:                 process.env.DATABASE_TYPE || c.database?.type || 'sqlite',
  MONGODB_URI:                   process.env.MONGODB_URI   || c.database?.uriMongodb || '',
  MONGODB_DATABASE:              process.env.MONGODB_DATABASE || c.database?.mongodbDatabase || 'instagram_bot',
  DB_AUTO_SYNC_WHEN_START:       c.database?.autoSyncWhenStart ?? false,
  DB_AUTO_REFRESH_THREAD_FIRST:  c.database?.autoRefreshThreadInfoFirstTime ?? true,
  DATABASE_PATH:                 process.env.DATABASE_PATH || './storage/data/bot.sqlite',
  DATABASE_AUTO_SAVE:            c.database?.autoSave ?? true,
  DATABASE_SAVE_INTERVAL:        (c.database?.saveIntervalMinutes ?? 1) * 60 * 1000,

  TIMEZONE: process.env.TZ || c.timeZone || 'UTC',

  DASHBOARD_ENABLE:      c.dashBoard?.enable ?? false,
  DASHBOARD_EXPIRE_CODE: c.dashBoard?.expireVerifyCode ?? 300000,
  DASHBOARD_PORT:        c.dashBoard?.port ?? 3000,

  SERVER_UPTIME_ENABLE: c.serverUptime?.enable ?? false,
  SERVER_UPTIME_PORT:   c.serverUptime?.port ?? 3000,
  SERVER_UPTIME_SOCKET: c.serverUptime?.socket || {},

  SPAM_COMMAND_THRESHOLD: c.spamProtection?.commandThreshold ?? 8,
  SPAM_TIME_WINDOW:       c.spamProtection?.timeWindow       ?? 10,
  SPAM_BAN_DURATION:      c.spamProtection?.banDuration      ?? 24,

  AUTO_RESTART_TIME: c.autoRestart?.time || null,

  AUTO_UPTIME_ENABLE:   c.autoUptime?.enable ?? true,
  AUTO_UPTIME_INTERVAL: c.autoUptime?.timeInterval ?? 180,
  AUTO_UPTIME_URL:      c.autoUptime?.url || '',

  AUTO_LOAD_SCRIPTS_ENABLE:  c.autoLoadScripts?.enable ?? false,
  AUTO_LOAD_IGNORE_CMDS:     c.autoLoadScripts?.ignoreCmds || '',
  AUTO_LOAD_IGNORE_EVENTS:   c.autoLoadScripts?.ignoreEvents || '',

  AUTO_REFRESH_FBSTATE:           c.autoRefreshFbstate           ?? true,
  AUTO_RELOGIN_WHEN_CHANGE:       c.autoReloginWhenChangeAccount ?? false,
  AUTO_RESTART_WHEN_MQTT_ERROR:   c.autoRestartWhenListenMqttError ?? false,

  RESTART_LISTEN_MQTT: {
    enable:                  c.restartListenMqtt?.enable ?? true,
    timeRestart:             c.restartListenMqtt?.timeRestart ?? 3600000,
    delayAfterStopListening: c.restartListenMqtt?.delayAfterStopListening ?? 2000,
    logNoti:                 c.restartListenMqtt?.logNoti ?? true
  },

  NOTI_MQTT_ERROR: {
    telegram:    c.notiWhenListenMqttError?.telegram    || { enable: false, botToken: '', chatId: '' },
    discordHook: c.notiWhenListenMqttError?.discordHook || { enable: false, webhookUrl: '' }
  },

  HIDE_NOTI: {
    commandNotFound:            c.hideNotiMessage?.commandNotFound            ?? false,
    adminOnly:                  c.hideNotiMessage?.adminOnly                  ?? false,
    threadBanned:               c.hideNotiMessage?.threadBanned               ?? false,
    userBanned:                 c.hideNotiMessage?.userBanned                 ?? false,
    needRoleToUseCmd:           c.hideNotiMessage?.needRoleToUseCmd           ?? false,
    needRoleToUseCmdOnReply:    c.hideNotiMessage?.needRoleToUseCmdOnReply    ?? false,
    needRoleToUseCmdOnReaction: c.hideNotiMessage?.needRoleToUseCmdOnReaction ?? false
  },

  LOG_EVENTS: {
    disableAll:       c.logEvents?.disableAll      ?? false,
    message:          c.logEvents?.message         ?? true,
    message_reaction: c.logEvents?.message_reaction ?? true,
    message_unsend:   c.logEvents?.message_unsend  ?? true,
    message_reply:    c.logEvents?.message_reply   ?? true,
    event:            c.logEvents?.event           ?? true,
    read_receipt:     c.logEvents?.read_receipt    ?? false,
    typ:              c.logEvents?.typ             ?? false,
    presence:         c.logEvents?.presence        ?? false
  },

  TYPING_INDICATOR:          c.typingIndicator?.enable   ?? true,
  TYPING_INDICATOR_DURATION: c.typingIndicator?.duration ?? 500,

  HUMAN_DELAY: c.humanDelay || { min: 500, max: 2000 },
  LOGGING:     c.logging || { logLevel: 'info', logToFile: true, webhookUrl: '' },
  AI_FALLBACK: c.AI_FALLBACK || { enable: false, command: 'gpt' },

  AUTO_REMOVE_ERROR: c.autoRemoveError || { enable: true, delay: 10 },

  OPTIONS_ICA: (() => {
    const o = c.optionsIca || c.optionsFca || {};
    const clean = {};
    for (const [k, v] of Object.entries(o)) {
      if (k !== 'notes') clean[k] = v;
    }
    return clean;
  })(),

  OPTIONS_FCA: (() => {
    const o = c.optionsIca || c.optionsFca || {};
    const clean = {};
    for (const [k, v] of Object.entries(o)) {
      if (k !== 'notes') clean[k] = v;
    }
    return clean;
  })(),

  ACCOUNT_FILE:  process.env.ACCOUNT_FILE || './account.txt',
  COMMANDS_PATH: './commands',
  EVENTS_PATH:   './events',
  LOGS_PATH:     './storage/logs',
  DATA_PATH:     './storage/data',
  TEMP_PATH:     './temp',

  LOG_LEVEL:              process.env.LOG_LEVEL || 'info',
  ENABLE_FILE_LOGGING:    true,
  ENABLE_CONSOLE_LOGGING: true,

  MESSAGE_DELAY_MS: c.messageDelayMs ?? 100,

  AUTO_RECONNECT:         true,
  MAX_RECONNECT_ATTEMPTS: 5,
  SESSION_SECRET:         process.env.SESSION_SECRET || 'goatbot_ig_secret',

  _raw: c
};
