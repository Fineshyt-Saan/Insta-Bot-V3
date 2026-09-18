"use strict";

const { createCanvas } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "ttp",
    aliases: ["texttopicture", "textimg"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Convert text to an artistic Canvas picture" },
    category: "fun",
    usage: { en: "{p}ttp <your text here>" }
  },

  onStart: async function ({ api, event, args, message }) {
    const reply = event.messageReply || event.repliedMessage;
    const text = args.join(" ").trim() || (reply && (reply.body || reply.text)) || "";
    if (!text) {
      return message.reply("⚠️ Please provide text to convert to an image, or reply to a message with {p}ttp.\nExample: {p}ttp Hello Instagram");
    }

    if (message && typeof message.react === "function") {
      message.react("🎨");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("🎨", event.messageID, event.threadID, () => {}, true);
    }

    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Vibrant background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#4facfe");
    grad.addColorStop(1, "#00f2fe");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 42px sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // Word wrapping
    const words = text.split(" ");
    let line = "";
    const lines = [];
    const maxW = width - 80;

    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxW && i > 0) {
        lines.push(line);
        line = words[i] + " ";
      } else {
        line = test;
      }
    }
    lines.push(line);

    const startY = (height / 2) - ((lines.length - 1) * 26);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].trim(), width / 2, startY + (i * 52));
    }

    const tempDir = path.join(process.cwd(), "temp");
    await fs.ensureDir(tempDir);
    const tempPath = path.join(tempDir, `ttp_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
    await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

    const sent = await message.reply({
      body: `🎨 TTP Result:\n"${text}"`,
      attachment: tempPath,
      textFirst: true
    });

    setTimeout(() => {
      fs.unlink(tempPath).catch(() => {});
    }, 20000);
    return sent;
  }
};
