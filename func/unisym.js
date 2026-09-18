/**
 * Universal Symbol and Aliasing Normalizer
 */

function normalizeCommandName(name) {
  if (!name) return "";
  return String(name).toLowerCase().replace(/\s+/g, "").replace(/-/g, "_");
}

function removeCommandAliases(commands) {
  const result = {};
  const seen = new Set();
  for (const [key, cmd] of Object.entries(commands)) {
    const mainName = cmd.meta?.name || cmd.config?.name || key;
    if (!seen.has(mainName)) {
      seen.add(mainName);
      result[mainName] = cmd;
    }
  }
  return result;
}

function extractCommandRole(command) {
  const meta = command.meta || command.config || {};
  if (meta.role !== undefined) return meta.role;
  if (meta.hasPermssion !== undefined) return meta.hasPermssion;
  if (meta.hasPermission !== undefined) return meta.hasPermission;
  if (meta.botAdmin) return 2;
  if (meta.allowModerators) return 1.5;
  return 0;
}

function wrapEmoji(emoji, text) {
  return `${emoji} ${text} ${emoji}`;
}

function countEmojis(str) {
  return (String(str || "").match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
}

function clamp(min, val, max) {
  return Math.min(Math.max(val, min), max);
}

const UNIRedux = {
  charm: "🌌",
  line: "─",
  getLine(len = 20, char = "─") {
    return char.repeat(len);
  },
  wrapEmoji,
  countEmojis,
  clamp,
  toString() {
    return "🌌 𝗙𝗹𝗼𝗽𝗽𝗮-𝗖𝗵𝗮𝘁𝗯𝗼𝘁 ✦";
  }
};

const UNISpectra = {
  charm: "⚡",
  line: "─",
  getLine(len = 20, char = "─") {
    return char.repeat(len);
  },
  wrapEmoji,
  countEmojis,
  clamp,
  toString() {
    return "⚡ 𝗙𝗹𝗼𝗽𝗽𝗮-𝗘𝗻𝗴𝗶𝗻𝗲 ✦";
  }
};

module.exports = {
  normalizeCommandName,
  removeCommandAliases,
  extractCommandRole,
  wrapEmoji,
  countEmojis,
  clamp,
  UNIRedux,
  UNISpectra
};
