const axios = require("axios");

module.exports = {
  config: {
    name: "dalle3",
    version: "1.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: "Generate image using DALL-E 3",
    category: "ai-image",
    usage: "dalle3 <prompt>"
  },

  onStart: async function ({ message, args, event, api }) {
    const reply = event.messageReply || event.repliedMessage;
    const prompt = args.join(" ").trim() || (reply && (reply.body || reply.text)) || "";
    if (!prompt) return message.reply("❌ Please provide a prompt.");

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${Date.now()}`;
      await message.reply({
        body: `✅ | DALL-E 3: "${prompt}"`,
        attachment: url
      });
      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }
    } catch (error) {
      console.error('dalle3 error:', error.message);
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      message.reply("❌ | Failed to generate DALL-E 3 image.");
    }
  }
};
