"use strict";

/**
 * YouTube Video Downloader Command
 * Searches and downloads MP4 videos from YouTube
 */

const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "video",
    aliases: ["vdo", "ytvideo"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 8,
    role: 0,
    category: "media",
    description: { en: "Search and download YouTube videos" },
    usage: { en: "{p}video <title> | {p}video <title> --top | {p}video <number>" }
  },

  onStart: async function ({ message, args, event, api, usersData, setReplyHandler }) {
    const threadID = event.threadId || event.threadID;
    const reply = event.messageReply || event.repliedMessage;
    const query = args.join(" ").trim() || (reply && (reply.body || reply.text)) || "";

    if (!query) {
      return message.reply("🎥 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗿\n\n📌 Usage: {p}video <title>\nExample: {p}video Alan Walker Faded");
    }

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    const userEntry = (usersData && typeof usersData.get === "function") ? (usersData.get(event.senderID) || {}) : {};
    const cached = userEntry.data && userEntry.data.lastVideo;

    if (/^\d+$/.test(query) && cached && Array.isArray(cached.videos) && cached.videos.length) {
      const idx = Number(query) - 1;
      const pick = cached.videos[idx];
      if (!pick) return message.reply(`Pick a number between 1 and ${cached.videos.length}.`);
      return deliverVideo(message, api, event, pick);
    }

    try {
      const search = await yts(query.replace(/--top/gi, "").trim());
      const searchResults = (search?.videos || []).slice(0, 6).map(v => ({
        title: v.title,
        url: v.url,
        duration: v.timestamp || `${Math.floor(v.seconds / 60)}:${v.seconds % 60}`,
        author: v.author?.name || "YouTube"
      }));

      if (searchResults.length === 0) {
        if (message && typeof message.react === "function") {
          message.react("❌");
        } else if (api && typeof api.setMessageReaction === "function") {
          api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
        }
        return message.reply("❌ No videos found. Please try another query.");
      }

      if (usersData && typeof usersData.update === "function") {
        usersData.update(event.senderID, {
          data: Object.assign({}, userEntry.data, { lastVideo: { query, videos: searchResults } })
        });
      }

      if (searchResults.length === 1 || args.includes("--top")) {
        return deliverVideo(message, api, event, searchResults[0]);
      }

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      let msg = `🎥 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼 𝗦𝗲𝗮𝗿𝗰𝗵:\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
      searchResults.forEach((v, i) => {
        msg += `${i + 1}. ${v.title}\n   ⏱️ [${v.duration}] | 👤 ${v.author}\n\n`;
      });
      msg += `👉 Reply with number (1-${searchResults.length}) to download!`;

      const sent = await message.reply(msg);

      if (typeof setReplyHandler === "function" && sent?.messageID) {
        setReplyHandler(async ({ message: replyMessage, event: replyEvent }) => {
          const pickStr = String(replyEvent.body || "").trim().split(/\s+/).pop();
          if (!/^\d+$/.test(pickStr)) return;
          const choice = parseInt(pickStr, 10);
          if (choice < 1 || choice > searchResults.length) return;
          await deliverVideo(replyMessage, api, replyEvent, searchResults[choice - 1]);
        }, sent.messageID);
      }

      if (global.GoatBot?.onReply && sent?.messageID) {
        global.GoatBot.onReply.set(sent.messageID, {
          commandName: "video",
          author: event.senderID,
          results: searchResults
        });
      }

      return sent;
    } catch (e) {
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Search error: ${e.message}`);
    }
  },

  onReply: async function ({ message, event, Reply, api }) {
    if (Reply.author && event.senderID !== Reply.author) return;
    const choice = parseInt(event.body?.trim(), 10);
    if (isNaN(choice) || choice < 1 || choice > Reply.results?.length) return;
    const selected = Reply.results[choice - 1];
    return deliverVideo(message, api, event, selected);
  },

  run: async function (params) {
    return module.exports.onStart(params);
  }
};

async function deliverVideo(message, api, event, selected) {
  if (message && typeof message.react === "function") {
    message.react("⏳");
  } else if (api && typeof api.setMessageReaction === "function") {
    api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
  }

  const tempDir = path.join(process.cwd(), "temp");
  await fs.ensureDir(tempDir);
  const tempPath = path.join(tempDir, `video_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

  try {
    // 1. Native ytdl-core stream download
    try {
      const stream = ytdl(selected.url, { filter: "videoandaudio", quality: "highestvideo" });
      const writer = fs.createWriteStream(tempPath);
      stream.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        stream.on("error", reject);
      });

      const stats = await fs.stat(tempPath);
      if (stats.size > 10000) {
        if (message && typeof message.react === "function") {
          message.react("✅");
        } else if (api && typeof api.setMessageReaction === "function") {
          api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
        }
        const caption = `🎥 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼: ${selected.title}\n⏱️ [${selected.duration}]`;
        const sent = await message.reply({ body: caption, attachment: { path: tempPath, type: "video" }, textFirst: true });
        setTimeout(() => fs.unlink(tempPath).catch(() => {}), 30000);
        return sent;
      }
    } catch (_) {
      await fs.unlink(tempPath).catch(() => {});
    }

    // 2. Cobalt API Fallback
    try {
      const cobRes = await axios.post("https://api.cobalt.tools/api/json", {
        url: selected.url,
        downloadMode: "auto"
      }, {
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        timeout: 15000
      });
      if (cobRes.data?.url) {
        if (message && typeof message.react === "function") {
          message.react("✅");
        } else if (api && typeof api.setMessageReaction === "function") {
          api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
        }
        const caption = `🎥 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼: ${selected.title}`;
        return message.reply({ body: caption, attachment: { url: cobRes.data.url, type: "video" }, textFirst: true });
      }
    } catch (_) {}

    throw new Error("Could not download video stream");
  } catch (err) {
    if (tempPath) fs.unlink(tempPath).catch(() => {});
    if (message && typeof message.react === "function") {
      message.react("❌");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
    }
    return message.reply(`❌ Download error: ${err.message}`);
  }
}
