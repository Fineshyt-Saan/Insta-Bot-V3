"use strict";

const { createCanvas, loadAvatarOrFallback } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile, extractImageUrl } = require("../src/utils");

module.exports = {
  config: {
    name: "wanted",
    aliases: ["wantedposter"],
    version: "2.5.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Create a Western wanted poster for a user or replied image" },
    category: "fun",
    usage: { en: "{p}wanted [@mention|UID|reply]" }
  },

  onStart: async function ({ event, args, message, api, usersData }) {
    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let photoUrl = await extractImageUrl(event, args, api);
    let name = "OUTLAW";

    if (!photoUrl) {
      let target = await resolveUserTarget(args, event, api);
      if (!target.id && (!args || args.length === 0) && event.senderID) {
        target = { id: String(event.senderID) };
      }
      const targetID = target.id || event.senderID;
      const profile = await resolveProfile([targetID], null, api);
      name = (profile && (profile.name || profile.username)) || (usersData && usersData.getName ? await usersData.getName(targetID) : null);
      if (!name || /^\d+$/.test(String(name).trim())) {
        name = "OUTLAW";
      }
      photoUrl = profile && profile.profilePicture;
    }

    let tempPath = null;
    try {
      const avatar = await loadAvatarOrFallback(photoUrl, name, 500);

      const canvas = createCanvas(700, 900);
      const ctx = canvas.getContext("2d");

      // Vintage paper bg
      ctx.fillStyle = "#f4ebd0";
      ctx.fillRect(0, 0, 700, 900);

      // Border
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#4a2c11";
      ctx.strokeRect(20, 20, 660, 860);

      // Header
      ctx.fillStyle = "#3b1e08";
      ctx.font = "bold 90px serif";
      ctx.textAlign = "center";
      ctx.fillText("WANTED", 350, 130);

      ctx.font = "bold 32px serif";
      ctx.fillText("DEAD OR ALIVE", 350, 180);

      // Avatar frame
      ctx.fillStyle = "#e6d7b8";
      ctx.fillRect(100, 210, 500, 500);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#3b1e08";
      ctx.strokeRect(100, 210, 500, 500);

      ctx.drawImage(avatar, 100, 210, 500, 500);

      ctx.fillStyle = "#3b1e08";
      ctx.font = "bold 44px serif";
      ctx.fillText(String(name).toUpperCase().slice(0, 22), 350, 760);

      const crimes = ["Stealing Hearts", "Being Too Cool", "Spreading Chaos", "High-Tech Hacking", "Extreme Swag"];
      const crime = crimes[Math.floor(Math.random() * crimes.length)];
      ctx.font = "italic 28px serif";
      ctx.fillText("CRIME: " + crime, 350, 805);

      const rewards = ["$5,000", "$10,000", "$25,000", "$50,000", "$100,000", "$1,000,000"];
      const reward = rewards[Math.floor(Math.random() * rewards.length)];
      ctx.font = "bold 36px serif";
      ctx.fillStyle = "#b22222";
      ctx.fillText("REWARD: " + reward, 350, 855);

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `wanted_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const sent = await message.reply({
        body: `📜 WANTED POSTER\n👤 Target: ${name}\n💣 Crime: ${crime}\n💰 Bounty: ${reward}`,
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
      return message.reply(`❌ Error creating wanted poster: ${err.message}`);
    }
  }
};
