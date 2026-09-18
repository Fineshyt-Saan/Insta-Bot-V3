"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile, extractImageUrl } = require("../src/utils");

module.exports = {
  config: {
    name: "jail",
    aliases: ["prison", "lockup"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Put a user or replied image behind prison bars on canvas" },
    category: "fun",
    usage: { en: "{p}jail [@mention|UID|reply]" }
  },

  onStart: async function ({ event, args, message, api, usersData }) {
    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let photoUrl = await extractImageUrl(event, args, api);
    let name = "Prisoner";

    if (!photoUrl) {
      let target = await resolveUserTarget(args, event, api);
      if (!target.id && (!args || args.length === 0) && event.senderID) {
        target = { id: String(event.senderID) };
      }
      const targetID = target.id || event.senderID;
      const profile = await resolveProfile([targetID], null, api);
      name = (profile && (profile.name || profile.username)) || (usersData && usersData.getName ? await usersData.getName(targetID) : null);
      if (!name || /^\d+$/.test(String(name).trim())) {
        name = "Prisoner";
      }
      photoUrl = profile && profile.profilePicture;
    }

    let tempPath = null;
    try {
      const width = 600;
      const height = 600;
      const avatar = await loadAvatarOrFallback(photoUrl, name, width);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(avatar, 0, 0, width, height);

      // Draw thick jail bars
      ctx.fillStyle = "rgba(40, 40, 40, 0.9)";
      const barCount = 7;
      const barWidth = 24;
      const spacing = (width - (barCount * barWidth)) / (barCount + 1);

      for (let i = 0; i < barCount; i++) {
        const x = spacing + i * (barWidth + spacing);
        ctx.fillRect(x, 0, barWidth, height);
        // Highlight on bar
        ctx.fillStyle = "rgba(180, 180, 180, 0.4)";
        ctx.fillRect(x + 4, 0, 6, height);
        ctx.fillStyle = "rgba(40, 40, 40, 0.9)";
      }

      // Horizontal crossbars
      ctx.fillRect(0, 120, width, barWidth);
      ctx.fillRect(0, height - 120, width, barWidth);

      // Label
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, height - 70, width, 70);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`🔒 ${String(name).toUpperCase()} IS IN JAIL!`, width / 2, height - 24);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `jail_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: `🔒 Locked behind bars: ${name === "Prisoner" ? "Prisoner" : "@" + name}`,
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
