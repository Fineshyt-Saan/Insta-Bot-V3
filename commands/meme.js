"use strict";

const { createCanvas, safeLoadImage } = require("../func/canvasHelper");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { extractImageUrl } = require("../src/utils");

module.exports = {
  config: {
    name: "meme",
    aliases: ["makememe"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "fun",
    description: { en: "Generate a custom meme or fetch a trending meme" },
    usage: { en: "{p}meme | {p}meme <top text> | <bottom text> (reply to photo)" }
  },

  onStart: async function ({ message, args, event, api }) {
    if (message && typeof message.react === "function") {
      message.react("🎭").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("🎭", event.messageID, event.threadID, () => {}, true);
    }

    let imageUrl = await extractImageUrl(event, args, api);

    let tempPath = null;
    try {
      // 1. Fetch random trending meme if no text and no image
      if (!imageUrl && args.length === 0) {
        const res = await axios.get("https://meme-api.com/gimme", { timeout: 15000 });
        const data = res.data;
        if (!data || !data.url) throw new Error("Could not fetch meme from api");

        const imgRes = await axios.get(data.url, { responseType: "arraybuffer", timeout: 20000 });
        const tempDir = path.join(process.cwd(), "temp");
        await fs.ensureDir(tempDir);
        tempPath = path.join(tempDir, `meme_${Date.now()}.jpg`);
        await fs.writeFile(tempPath, Buffer.from(imgRes.data));

        if (message && typeof message.react === "function") {
          message.react("✅").catch(() => {});
        } else if (api && typeof api.setMessageReaction === "function") {
          api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
        }

        const sent = await message.reply({
          body: `🎭 ${data.title || "Trending Meme"} (r/${data.subreddit})`,
          attachment: tempPath,
          textFirst: true
        });

        setTimeout(() => fs.unlink(tempPath).catch(() => {}), 20000);
        return sent;
      }

      // 2. Custom Canvas meme generator
      const fullText = args.join(" ");
      const [topText, bottomText] = fullText.includes("|") ? fullText.split("|").map(s => s.trim()) : [fullText, ""];

      const targetUrl = imageUrl || "https://i.imgflip.com/1g8my4.jpg"; // Two buttons fallback
      let img;
      try {
        img = await safeLoadImage(targetUrl);
      } catch (loadErr) {
        if (targetUrl !== "https://i.imgflip.com/1g8my4.jpg") {
          img = await safeLoadImage("https://i.imgflip.com/1g8my4.jpg");
        } else {
          throw loadErr;
        }
      }

      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const fontSize = Math.max(24, Math.floor(img.height / 10));
      ctx.font = `bold ${fontSize}px Impact, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(3, Math.floor(fontSize / 8));
      ctx.textAlign = "center";

      if (topText) {
        ctx.strokeText(topText.toUpperCase(), img.width / 2, fontSize + 10);
        ctx.fillText(topText.toUpperCase(), img.width / 2, fontSize + 10);
      }

      if (bottomText) {
        ctx.strokeText(bottomText.toUpperCase(), img.width / 2, img.height - 20);
        ctx.fillText(bottomText.toUpperCase(), img.width / 2, img.height - 20);
      }

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `meme_${Date.now()}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: "🎭 Here is your meme!",
        attachment: tempPath,
        textFirst: true
      });

      setTimeout(() => fs.unlink(tempPath).catch(() => {}), 20000);
      return sent;
    } catch (err) {
      if (tempPath) fs.unlink(tempPath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      return message.reply(`❌ Meme error: ${err.message}`);
    }
  }
};
