"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile } = require("../src/utils");

module.exports = {
  config: {
    name: "slap",
    aliases: ["smack", "hit"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Slap another user with a funny canvas graphic" },
    category: "fun",
    usage: { en: "{p}slap @mention or reply" }
  },

  onStart: async function ({ api, event, args, message, usersData }) {
    let target = await resolveUserTarget(args, event, api);
    const targetID = target.id;
    const senderID = event.senderID;

    if (!targetID || targetID === senderID) {
      return message.reply("👋 Please @mention or reply to someone you want to slap!");
    }

    if (message && typeof message.react === "function") {
      message.react("👋").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("👋", event.messageID, event.threadID, () => {}, true);
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
      if (!targetName || /^\d+$/.test(String(targetName).trim())) targetName = "Victim";

      const [senderAvatar, targetAvatar] = await Promise.all([
        loadAvatarOrFallback(senderProfile?.profilePicture, senderName, 150),
        loadAvatarOrFallback(targetProfile?.profilePicture, targetName, 150)
      ]);

      const canvas = createCanvas(700, 420);
      const ctx = canvas.getContext("2d");

      // Energetic gradient
      const grad = ctx.createLinearGradient(0, 0, 700, 420);
      grad.addColorStop(0, "#e74c3c");
      grad.addColorStop(1, "#c0392b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 700, 420);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("💥 HARD SLAP! 💥", 350, 70);

      // Slapper (Sender)
      ctx.save();
      ctx.beginPath();
      ctx.arc(200, 220, 75, 0, Math.PI * 2);
      ctx.clip();
      if (senderAvatar) {
        ctx.drawImage(senderAvatar, 125, 145, 150, 150);
      } else {
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(125, 145, 150, 150);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText(senderName[0] || "S", 200, 240);
      }
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(200, 220, 75, 0, Math.PI * 2);
      ctx.stroke();

      // Slapped (Target)
      ctx.save();
      ctx.beginPath();
      ctx.arc(500, 220, 75, 0, Math.PI * 2);
      ctx.clip();
      if (targetAvatar) {
        ctx.drawImage(targetAvatar, 425, 145, 150, 150);
      } else {
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(425, 145, 150, 150);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText(targetName[0] || "T", 500, 240);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(500, 220, 75, 0, Math.PI * 2);
      ctx.stroke();

      // Impact in center
      ctx.font = "55px sans-serif";
      ctx.fillText("👋⚡", 350, 240);

      ctx.font = "bold 22px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(senderName).slice(0, 14), 200, 335);
      ctx.fillText(String(targetName).slice(0, 14), 500, 335);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `slap_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      const caption = `👋💥 ${senderName} delivered an epic supersonic slap to ${targetName}! OUCH!`;
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
      return message.reply(`👋 ${senderName} slapped ${targetName}!`);
    }
  }
};
