const axios = require("axios");

module.exports = {
  config: {
    name: "gemini",
    aliases: ["gmn"],
    version: "1.3",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    description: "Gemini AI with image & text support",
    category: "ai",
    usage: "{pn} <text question> or reply to an image",
    cooldown: 5,
    role: 0
  },

  onStart: async function({ api, event, args, message, logger }) {
    const uid = event.senderID || 1;
    const apikey = "66e0cfbb-62b8-4829-90c7-c78cacc72ae2";

    let imageUrl = "";
    const reply = event.messageReply;
    if (reply && reply.attachments && reply.attachments.length > 0) {
      const photo = reply.attachments.find(a => a.type === "photo" || a.type === "image");
      if (photo) {
        imageUrl = photo.url;
      }
    }

    let payloadUrl = "";
    if (imageUrl) {
      // Per the source: https://github.com/mdajmaul/goatbot_ajmaul_83/blob/main/scripts/cmds/Gemini.js
      // The image URL is sent in the 'ask' parameter.
      payloadUrl = `https://kaiz-apis.gleeze.com/api/gemini-pro?ask=${encodeURIComponent(imageUrl)}&uid=${uid}&apikey=${apikey}`;
    } else {
      if (args.length === 0) {
        return message.reply("❌ Please provide a question or reply to an image with a question.");
      }
      const textQuery = args.join(" ");
      payloadUrl = `https://kaiz-apis.gleeze.com/api/gemini-pro?ask=${encodeURIComponent(textQuery)}&uid=${uid}&apikey=${apikey}`;
    }

    try {
      message.reaction("⏳");
      const res = await axios.get(payloadUrl);

      const rawRes = res.data?.response || res.data?.reply || (typeof res.data === 'string' ? res.data : null);
      if (rawRes && typeof rawRes === 'string') {
        const cleaned = rawRes.trim();
        if (!cleaned.startsWith('<') && !/<!DOCTYPE|<html|<head|<script|cloudflare|just a moment|fingerprint/i.test(cleaned)) {
          message.reaction("✅");
          return message.reply(cleaned);
        }
      }
      message.reaction("⚠️");
      return message.reply("⚠️ No valid response from Gemini API.");
    } catch (err) {
      logger.error("Gemini API error:", err.message);
      message.reaction("❌");
      return message.reply("❌ Failed to contact Gemini API. Please try again later.");
    }
  }
};
