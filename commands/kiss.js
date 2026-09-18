"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile } = require("../src/utils");

module.exports = {
  config: {
    name: "kiss",
    aliases: ["smooch"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Generate a romantic kiss canvas with user avatars" },
    category: "fun",
    usage: { en: "{p}kiss @mention or reply" }
  },

  onStart: async function ({ api, event, args, message, usersData }) {
    let target = await resolveUserTarget(args, event, api);
    const targetID = target.id;
    const senderID = event.senderID;

    if (!targetID || targetID === senderID) {
      return message.reply("😚 Please @mention or reply to someone you want to kiss!");
    }

    if (message && typeof message.react === "function") {
      message.react("💖").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("💖", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      const [senderProfile, targetProfile] = await Promise.all([
        resolveProfile([senderID], null, api).catch(() => null),
        resolveProfile([targetID], null, api).catch(() => null)
      ]);

      let senderName = (senderProfile && (senderProfile.name || senderProfile.username)) || (usersData && usersData.getName ? await usersData.getName(senderID) : null);
      if (!senderName || /^\d+$/.test(String(senderName).trim())) senderName = "You";
      let targetName = (targetProfile && (targetProfile.name || targetProfile.username)) || (usersData && usersData.getName ? await usersData.getName(targetID) : null);
      if (!targetName || /^\d+$/.test(String(targetName).trim())) targetName = "Crush";

      const [senderAvatar, targetAvatar] = await Promise.all([
        loadAvatarOrFallback(senderProfile?.profilePicture, senderName, 150),
        loadAvatarOrFallback(targetProfile?.profilePicture, targetName, 150)
      ]);

      const canvas = createCanvas(700, 420);
      const ctx = canvas.getContext("2d");

      // Romantic gradient
      const grad = ctx.createLinearGradient(0, 0, 700, 420);
      grad.addColorStop(0, "#f857a6");
      grad.addColorStop(1, "#ff5858");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 700, 420);

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("💋 SWEET KISS 💋", 350, 70);

      // Left circle (Sender)
      ctx.save();
      ctx.beginPath();
      ctx.arc(220, 220, 75, 0, Math.PI * 2);
      ctx.clip();
      if (senderAvatar) {
        ctx.drawImage(senderAvatar, 145, 145, 150, 150);
      } else {
        ctx.fillStyle = "#ffeaa7";
        ctx.fillRect(145, 145, 150, 150);
        ctx.fillStyle = "#333";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText(senderName[0] || "U", 220, 240);
      }
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(220, 220, 75, 0, Math.PI * 2);
      ctx.stroke();

      // Right circle (Target)
      ctx.save();
      ctx.beginPath();
      ctx.arc(480, 220, 75, 0, Math.PI * 2);
      ctx.clip();
      if (targetAvatar) {
        ctx.drawImage(targetAvatar, 405, 145, 150, 150);
      } else {
        ctx.fillStyle = "#fd79a8";
        ctx.fillRect(405, 145, 150, 150);
        ctx.fillStyle = "#333";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText(targetName[0] || "T", 480, 240);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(480, 220, 75, 0, Math.PI * 2);
      ctx.stroke();

      // Center heart
      ctx.font = "50px sans-serif";
      ctx.fillText("❤️", 350, 235);

      // Names
      ctx.font = "bold 22px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(senderName).slice(0, 14), 220, 335);
      ctx.fillText(String(targetName).slice(0, 14), 480, 335);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `kiss_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      const caption = `💋 ${senderName} gave a sweet and passionate kiss to ${targetName}! ❤️🔥`;
      const sent = await message.reply({
        body: caption,
        attachment: tempPath,
        textFirst: true
      });

      setTimeout(() => {
        if (tempPath) fs.unlink(tempPath).catch(() => {});
      }, 20000);
      return sent;
    } catch (err) {
      if (tempPath) fs.unlink(tempPath).catch(() => {});
      return message.reply(`💋 ${senderName} gave a sweet kiss!`);
    }
  }
};
