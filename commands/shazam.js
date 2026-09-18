"use strict";

const axios = require("axios");

module.exports = {
  config: {
    name: "shazam",
    aliases: ["whatsong", "findmusic", "identify"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "media",
    description: { en: "Identify a song from an audio or video reply" },
    usage: { en: "{p}shazam (reply to voice/audio/video)" }
  },

  onStart: async function ({ message, event, api }) {
    let audioUrl = null;

    const reply = event.messageReply || event.repliedMessage || event.replyTo;
    if (reply?.attachments?.length > 0) {
      for (const a of reply.attachments) {
        const u = a.url || a.playableUrl || a.playable_url || a.src || a.video || a.audio;
        if (u) {
          audioUrl = u;
          break;
        }
      }
    }

    if (!audioUrl && event.attachments?.length > 0) {
      for (const a of event.attachments) {
        const u = a.url || a.playableUrl || a.playable_url || a.src || a.video || a.audio;
        if (u) {
          audioUrl = u;
          break;
        }
      }
    }

    if (!audioUrl && global.utils?.extractMediaUrl) {
      try {
        audioUrl = await global.utils.extractMediaUrl(event, [], api);
      } catch (_) {}
    }

    if (!audioUrl) {
      return message.reply("🔍 𝗦𝗵𝗮𝘇𝗮𝗺 𝗦𝗼𝗻𝗴 𝗙𝗶𝗻𝗱𝗲𝗿\n\n📌 Please reply to an audio or video message with {p}shazam to identify the track!");
    }

    if (message && typeof message.react === "function") {
      message.react("🔍");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("🔍", event.messageID, event.threadID, () => {}, true);
    }

    try {
      const res = await axios.get(`https://kaiz-apis.gleeze.com/api/shazam?url=${encodeURIComponent(audioUrl)}`, {
        timeout: 25000
      });
      const track = res.data?.track || res.data?.data || res.data;

      if (!track || !track.title) {
        throw new Error("No match found for this audio sample.");
      }

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      return message.reply(
        `🎵 𝗦𝗵𝗮𝘇𝗮𝗺 𝗠𝗮𝘁𝗰𝗵!\n\n` +
        `🏷️ Title: ${track.title}\n` +
        `👤 Artist: ${track.subtitle || track.artist || "Unknown"}\n` +
        `💿 Album: ${track.sections?.[0]?.metadata?.[0]?.text || "Single"}\n` +
        `💡 Use {p}sing ${track.title} to download!`
      );
    } catch (err) {
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Shazam could not identify this track: ${err.message}`);
    }
  }
};
