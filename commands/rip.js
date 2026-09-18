"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile, extractImageUrl } = require("../src/utils");

module.exports = {
  config: {
    name: "rip",
    aliases: ["grave", "tombstone", "dead"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Generate a RIP tombstone graphic for a user or replied image" },
    category: "fun",
    usage: { en: "{p}rip [@mention|UID|reply]" }
  },

  onStart: async function ({ event, args, message, api, usersData }) {
    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let photoUrl = await extractImageUrl(event, args, api);
    let name = "Legend";

    if (!photoUrl) {
      let target = await resolveUserTarget(args, event, api);
      if (!target.id && (!args || args.length === 0) && event.senderID) {
        target = { id: String(event.senderID) };
      }
      const targetID = target.id || event.senderID;
      const profile = await resolveProfile([targetID], null, api);
      name = (profile && (profile.name || profile.username)) || (usersData && usersData.getName ? await usersData.getName(targetID) : null);
      if (!name || /^\d+$/.test(String(name).trim())) {
        name = "Legend";
      }
      photoUrl = profile && profile.profilePicture;
    }

    let tempPath = null;
    try {
      const avatar = await loadAvatarOrFallback(photoUrl, name, 170);

      const canvas = createCanvas(600, 700);
      const ctx = canvas.getContext("2d");

      // Dark background
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, 600, 700);

      // Tombstone outline
      ctx.fillStyle = "#4b5563";
      ctx.beginPath();
      ctx.arc(300, 260, 220, Math.PI, 0);
      ctx.lineTo(520, 620);
      ctx.lineTo(80, 620);
      ctx.closePath();
      ctx.fill();

      // Inner tombstone
      ctx.fillStyle = "#374151";
      ctx.beginPath();
      ctx.arc(300, 260, 200, Math.PI, 0);
      ctx.lineTo(500, 600);
      ctx.lineTo(100, 600);
      ctx.closePath();
      ctx.fill();

      // Heading
      ctx.fillStyle = "#d1d5db";
      ctx.font = "bold 60px serif";
      ctx.textAlign = "center";
      ctx.fillText("R. I. P.", 300, 180);

      // Avatar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(300, 310, 85, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 215, 225, 170, 170);
      ctx.restore();

      ctx.lineWidth = 4;
      ctx.strokeStyle = "#9ca3af";
      ctx.beginPath();
      ctx.arc(300, 310, 85, 0, Math.PI * 2);
      ctx.stroke();

      // Epitaph
      ctx.fillStyle = "#f3f4f6";
      ctx.font = "bold 34px serif";
      ctx.fillText(String(name).slice(0, 20), 300, 440);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "italic 22px serif";
      ctx.fillText("Always remembered, never forgotten", 300, 485);

      const years = `2000 — ${new Date().getFullYear()}`;
      ctx.font = "bold 24px serif";
      ctx.fillText(years, 300, 530);

      // Ground grass
      ctx.fillStyle = "#064e3b";
      ctx.fillRect(0, 620, 600, 80);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `rip_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: `🪦 Rest In Peace ${name === "Legend" ? "Legend" : "@" + name}`,
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
      return message.reply(`❌ Error: ${err.message}`);
    }
  }
};
