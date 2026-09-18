const axios = require("axios");

module.exports = {
  config: {
    name: "genx",
    version: "1.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: "Generate image using GenX",
    category: "ai-image",
    usage: "genx <prompt>"
  },

  onStart: async function ({ message, args, event, api }) {
    let prompt = args.join(" ").trim();
    if (!prompt) {
      const reply = event.messageReply || event.repliedMessage || event.replyTo;
      if (reply?.body) {
        prompt = reply.body.trim();
      }
    }

    if (!prompt) return message.reply("❌ Please provide a prompt or reply to a message with {p}genx.");

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${Date.now()}`;
      await message.reply({
        body: `✅ | GenX: "${prompt}"`,
        attachment: url
      });
      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }
    } catch (error) {
      console.error('genx error:', error.message);
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      message.reply("❌ | Failed to generate GenX image.");
    }
  }
};
