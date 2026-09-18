"use strict";

const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "ytb",
    aliases: ["youtube", "ytdl"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 8,
    role: 0,
    category: "media",
    description: { en: "Download YouTube audio or video directly" },
    usage: { en: "{p}ytb <search or link> [--audio|--video]" }
  },

  onStart: async function ({ message, args, event, api }) {
    const reply = event.messageReply || event.repliedMessage;
    const isAudio = args.includes("--audio") || args.includes("-a") || !args.includes("--video");
    const query = args.filter(a => !a.startsWith("-")).join(" ").trim() || (reply && (reply.body || reply.text)) || "";

    if (!query) {
      return message.reply("▶️ 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗿\n\n📌 Usage: {p}ytb <song/video title or link> [--audio|--video]");
    }

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      let videoUrl = query;
      let title = "YouTube Media";
      let duration = "";

      if (!ytdl.validateURL(query)) {
        const search = await yts(query);
        const first = search?.videos?.[0];
        if (!first) throw new Error("No YouTube videos found for query");
        videoUrl = first.url;
        title = first.title;
        duration = first.timestamp;
      }

      const ext = isAudio ? "mp3" : "mp4";
      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `ytb_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);

      const stream = ytdl(videoUrl, {
        filter: isAudio ? "audioonly" : "videoandaudio",
        quality: isAudio ? "highestaudio" : "highestvideo"
      });

      const writer = fs.createWriteStream(tempPath);
      stream.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        stream.on("error", reject);
      });

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const caption = `▶️ 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 [${isAudio ? "AUDIO" : "VIDEO"}]\n📝 ${title.slice(0, 100)}${duration ? `\n⏱️ [${duration}]` : ""}`;
      const sent = await message.reply({
        body: caption,
        attachment: { path: tempPath, type: isAudio ? "audio" : "video" },
        textFirst: true
      });

      setTimeout(() => {
        if (tempPath) fs.unlink(tempPath).catch(() => {});
      }, 30000);
      return sent;
    } catch (err) {
      if (tempPath) fs.unlink(tempPath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ YouTube download error: ${err.message}`);
    }
  }
};
