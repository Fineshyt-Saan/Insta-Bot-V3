"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile } = require("../src/utils");

module.exports = {
  config: {
    name: "sms",
    aliases: ["fakesms", "textmsg", "imessage"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "fun",
    description: { en: "Generate an iPhone style SMS chat canvas graphic" },
    usage: { en: "{p}sms [@mention] <message text>" }
  },

  onStart: async function ({ api, event, args, message, usersData }) {
    let target = await resolveUserTarget(args, event, api);
    const targetID = target.id || event.senderID;
    const textWords = args.filter(a => !a.startsWith("@") && !/^\d{4,}$/.test(a));
    const text = textWords.join(" ").trim() || "Hey, what are you doing right now?";

    if (message && typeof message.react === "function") {
      message.react("💬").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("💬", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      const profile = await resolveProfile([targetID], null, api);
      let name = (profile && (profile.name || profile.username)) || (usersData && usersData.getName ? await usersData.getName(targetID) : null);
      if (!name || /^\d+$/.test(String(name).trim())) name = "Friend";
      const photoUrl = profile && profile.profilePicture;

      const avatar = await loadAvatarOrFallback(photoUrl, name, 100);

      const width = 600;
      const height = 350;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // iOS dark background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Top bar
      ctx.fillStyle = "#1c1c1e";
      ctx.fillRect(0, 0, width, 90);

      // Contact avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(300, 35, 25, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 275, 10, 50, 50);
      ctx.restore();

      // Contact name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(name).slice(0, 20), 300, 78);

      // Timestamp
      ctx.fillStyle = "#8e8e93";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText("iMessage • Today 9:41 AM", 300, 130);

      // Incoming bubble (from target)
      ctx.fillStyle = "#26252a";
      const bubbleW = Math.min(450, Math.max(160, ctx.measureText(text).width + 60));
      const bubbleH = 55;
      const bubbleX = 30;
      const bubbleY = 160;

      // Rounded rect
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 18) : ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);
      ctx.fill();

      // Text in bubble
      ctx.fillStyle = "#ffffff";
      ctx.font = "17px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(text.slice(0, 50), bubbleX + 16, bubbleY + 34);

      // Delivered label
      ctx.fillStyle = "#8e8e93";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText("Delivered", bubbleX + 5, bubbleY + bubbleH + 18);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `sms_${Date.now()}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: `💬 SMS from ${name}:\n"${text}"`,
        attachment: tempPath,
        textFirst: true
      });

      setTimeout(() => {
        if (tempPath) fs.unlink(tempPath).catch(() => {});
      }, 20000);
      return sent;
    } catch (err) {
      if (tempPath) fs.unlink(tempPath).catch(() => {});
      return message.reply(`💬 SMS: "${text}"`);
    }
  }
};
