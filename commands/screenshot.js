"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "screenshot",
    aliases: ["ss", "webshot", "shot"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "tools",
    description: { en: "Capture a full screenshot of any web page" },
    usage: { en: "{p}ss <url>" }
  },

  onStart: async function ({ message, args, event, api }) {
    let url = args[0];
    if (!url) {
      const reply = event.messageReply || event.repliedMessage || event.replyTo;
      if (reply?.body) {
        const match = reply.body.match(/https?:\/\/[^\s]+/i);
        if (match) url = match[0];
      }
    }

    if (!url) {
      return message.reply("📸 𝗪𝗲𝗯 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁\n\n📌 Usage: {p}ss <website_url>\n💡 Example: {p}ss https://google.com");
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    if (message && typeof message.react === "function") {
      message.react("📸");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("📸", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      const shotUrl = `https://image.thum.io/get/width/1280/crop/800/${url}`;
      const res = await axios.get(shotUrl, { responseType: "arraybuffer", timeout: 25000 });

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `ss_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, Buffer.from(res.data));

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: `📸 Screenshot of: ${url}`,
        attachment: tempPath,
        textFirst: true
      });

      setTimeout(() => {
        if (tempPath) fs.unlink(tempPath).catch(() => {});
      }, 20000);
      return sent;
    } catch (err) {
      if (tempPath) fs.unlink(tempPath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Could not capture screenshot: ${err.message}`);
    }
  }
};
