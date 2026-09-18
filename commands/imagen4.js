const axios = require("axios");

module.exports = {
  config: {
    name: "imagen4",
    version: "1.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: "Generate image using Imagen4",
    category: "ai-image",
    usage: "imagen4 <prompt>"
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
        body: `✅ | Imagen4: "${prompt}"`,
        attachment: url
      });
      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }
    } catch (error) {
      console.error('imagen4 error:', error.message);
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      message.reply("❌ | Failed to generate Imagen4 image.");
    }
  }
};
