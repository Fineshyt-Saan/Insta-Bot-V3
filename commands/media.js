"use strict";

/**
 * media.js — Universal Media Downloader & Media Processor for Instagram Direct.
 * Author: 𝐒𝐀𝐀𝐍 𝐄𝐗𝐇𝐀𝐔𝐒𝐓𝐄𝐃
 *
 * Capabilities:
 * - Download videos/audio from Instagram, TikTok, YouTube, Facebook, Twitter/X, Pinterest
 * - Extract audio from replied video messages
 * - Inspect media metadata (size, format, duration)
 * - Directly streams media to Instagram DM using InstaBOT / ICA transport.
 */

const axios = require("axios");

function extractUrl(event, args) {
  if (args.length > 0) {
    for (const arg of args) {
      if (typeof arg === "string" && /^https?:\/\//i.test(arg)) return arg;
    }
  }

  const reply = event.messageReply || event.repliedMessage || event.replyTo;
  if (reply?.body) {
    const match = reply.body.match(/https?:\/\/[^\s]+/i);
    if (match) return match[0];
  }

  if (reply?.attachments?.length > 0) {
    for (const a of reply.attachments) {
      const u = a.url || a.playableUrl || a.playable_url || a.video || a.src;
      if (u) return u;
    }
  }

  if (event.attachments?.length > 0) {
    for (const a of event.attachments) {
      const u = a.url || a.playableUrl || a.playable_url || a.video || a.src;
      if (u) return u;
    }
  }

  return null;
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function resolveMediaUrl(targetUrl, isAudio = false) {
  let downloadUrl = null;
  let title = "Media Content";
  let author = "";

  // 1. TikTok fast endpoint
  if (/tiktok\.com/i.test(targetUrl)) {
    try {
      const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*" },
        timeout: 8000
      });
      const d = res.data?.data;
      if (d) {
        downloadUrl = isAudio ? (d.music || d.play) : (d.play || d.hdplay || d.wmplay);
        title = d.title || "TikTok Video";
        author = d.author?.nickname || d.author?.unique_id || "";
        if (downloadUrl) {
          if (!downloadUrl.startsWith("http")) downloadUrl = `https://www.tikwm.com${downloadUrl}`;
          return { downloadUrl, title, author };
        }
      }
    } catch (_) {}
  }

  // 2. NeoKEX AllDL Universal Media API
  try {
    const res = await axios.get(`https://alldl.neokex.xyz/api/alldl?url=${encodeURIComponent(targetUrl)}`, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 12000
    });
    const d = res.data?.metadata?.data || res.data?.data;
    if (d && Array.isArray(d.downloads) && d.downloads.length > 0) {
      const notAudio = item => !String(item?.label).toLowerCase().includes("audio");
      const isAud = item => String(item?.label).toLowerCase().includes("audio");
      const pick = isAudio
        ? (d.downloads.find(isAud) || d.downloads[0])
        : (d.downloads.find(notAudio) || d.downloads[0]);
      if (pick?.url) {
        return {
          downloadUrl: pick.url,
          title: d.title || title,
          author: d.author?.nickname || d.author || author
        };
      }
    }
  } catch (_) {}

  // 3. Cobalt API
  try {
    const res = await axios.post("https://api.cobalt.tools/api/json", {
      url: targetUrl,
      downloadMode: isAudio ? "audio" : "auto"
    }, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      timeout: 12000
    });
    if (res.data?.url) {
      downloadUrl = res.data.url;
      return { downloadUrl, title, author };
    }
  } catch (_) {}

  // 4. Fallback direct or media extractor
  if (!downloadUrl && /\.(mp4|mov|mp3|m4a|webm)(\?.*)?$/i.test(targetUrl)) {
    downloadUrl = targetUrl;
    return { downloadUrl, title, author };
  }

  if (!downloadUrl) {
    throw new Error("Could not extract downloadable media from this link.");
  }

  return { downloadUrl, title, author };
}

module.exports = {
  config: {
    name: "media",
    aliases: ["mdown", "viddl", "getmedia", "mediafetch"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Download and extract videos, reels, stories and audio from URLs or replies" },
    category: "media",
    usage: { en: "{p}media <url> [--audio] | or reply to a video message with {p}media [audio|info]" }
  },

  onStart: async function ({ message, args, event, api }) {
    const isAudio = args.some(a => ["--audio", "-a", "audio", "mp3", "sound"].includes(String(a).toLowerCase()));
    const isInfoOnly = args.some(a => ["--info", "-i", "info"].includes(String(a).toLowerCase()));

    let targetUrl = extractUrl(event, args);
    if (!targetUrl && global.utils?.extractMediaUrl) {
      try {
        targetUrl = await global.utils.extractMediaUrl(event, args, api);
      } catch (_) {}
    }

    if (!targetUrl) {
      return message.reply(
        "🎬 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗮𝗹 𝗠𝗲𝗱𝗶𝗮 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗿\n\n" +
        "📌 Usage:\n" +
        "• {p}media <url> — download video from TikTok, IG, FB, YT, etc.\n" +
        "• {p}media <url> --audio — download audio track only\n" +
        "• (reply to video) {p}media — download or mirror media\n" +
        "• (reply to video) {p}media audio — extract audio from replied video"
      );
    }

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    try {
      const { downloadUrl, title, author } = await resolveMediaUrl(targetUrl, isAudio);

      if (isInfoOnly) {
        if (message && typeof message.react === "function") {
          message.react("ℹ️");
        } else if (api && typeof api.setMessageReaction === "function") {
          api.setMessageReaction("ℹ️", event.messageID, event.threadID, () => {}, true);
        }
        return message.reply(
          `ℹ️ 𝗠𝗲𝗱𝗶𝗮 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻\n\n` +
          `• Title:  ${title || "Unknown"}\n` +
          `• Author: ${author || "Unknown"}\n` +
          `• Source: ${targetUrl.slice(0, 60)}...\n` +
          `• Format: ${isAudio ? "Audio Stream" : "Video Stream"}`
        );
      }

      const caption = `🎬 𝗠𝗲𝗱𝗶𝗮: ${title}${author ? ` (by ${author})` : ""}\n[${isAudio ? "AUDIO" : "VIDEO"}]`;

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const attachment = {
        url: downloadUrl,
        type: isAudio ? "audio" : "video"
      };

      return await message.reply({
        body: caption,
        attachment,
        textFirst: true
      });
    } catch (err) {
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Failed to retrieve media: ${err.message || err}`);
    }
  }
};
