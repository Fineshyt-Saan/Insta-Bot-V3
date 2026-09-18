"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile, extractImageUrl } = require("../src/utils");

module.exports = {
  config: {
    name: "removebg",
    aliases: ["nobg", "rmbg"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 8,
    role: 0,
    category: "image",
    description: { en: "Remove background from an image or profile picture" },
    usage: { en: "{p}removebg (reply to photo) | {p}removebg -pfp" }
  },

  onStart: async function ({ message, args, event, api }) {
    let imageUrl = await extractImageUrl(event, args, api);

    if (!imageUrl && (args.includes("-pfp") || args.includes("--pfp"))) {
      const p = await resolveProfile([event.senderID], event, api);
      imageUrl = p?.profilePicture;
    }

    if (!imageUrl) {
      return message.reply("🖼️ 𝗥𝗲𝗺𝗼𝘃𝗲 𝗕𝗮𝗰𝗸𝗴𝗿𝗼𝘂𝗻𝗱\n\n📌 Reply to an image with: {p}removebg\nOr use: {p}removebg -pfp");
    }

    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      let targetUrl = imageUrl;
      try {
        const FormData = require("form-data");
        const form = new FormData();
        const dlRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 25000 });
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", Buffer.from(dlRes.data), { filename: "rbg.jpg" });
        const cbRes = await axios.post("https://catbox.moe/user/api.php", form, {
          headers: form.getHeaders(),
          timeout: 20000
        });
        if (typeof cbRes.data === "string" && cbRes.data.startsWith("http")) {
          targetUrl = cbRes.data.trim();
        }
      } catch (_) {}

      const res = await axios.get(`https://kaiz-apis.gleeze.com/api/removebg?url=${encodeURIComponent(targetUrl)}`, {
        responseType: "arraybuffer",
        timeout: 30000
      }).catch(async () => {
        return await axios.get(`https://api.siputzx.my.id/api/iloveimg/removebg?url=${encodeURIComponent(targetUrl)}`, {
          responseType: "arraybuffer",
          timeout: 30000
        });
      });

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `nobg_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);
      await fs.writeFile(tempPath, Buffer.from(res.data));

      if (message && typeof message.react === "function") {
        message.react("✨").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✨", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: "✨ Background removed successfully!",
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
        message.react("❌").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Could not remove background: ${err.message}`);
    }
  }
};
