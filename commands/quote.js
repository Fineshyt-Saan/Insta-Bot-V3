"use strict";

const { createCanvas } = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");
const { resolveProfile } = require("../src/utils");

const DEFAULT_QUOTES = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Act as if what you do makes a difference. It does.", author: "William James" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" }
];

module.exports = {
  config: {
    name: "quote",
    aliases: ["quotes", "inspire", "quotecard"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    description: { en: "Generate a beautifully styled Canvas quote card" },
    category: "fun",
    usage: { en: "{p}quote [custom text | author] or just {p}quote" }
  },

  onStart: async function ({ api, event, args, message }) {
    let text = args.join(" ").trim();
    let quote = "";
    let author = "";

    const reply = event.messageReply || event.repliedMessage;
    const replyText = reply && (reply.body || reply.text);

    if (text) {
      if (text.includes("|")) {
        const parts = text.split("|").map(s => s.trim());
        quote = parts[0];
        author = parts[1] || "Anonymous";
      } else {
        quote = text;
        const prof = event.senderID ? await resolveProfile([event.senderID], event, api).catch(() => null) : null;
        author = (prof && (prof.name || (prof.username ? `@${prof.username}` : null))) || "Anonymous";
      }
    } else if (replyText) {
      quote = replyText;
      const targetUID = reply.senderID;
      const prof = targetUID ? await resolveProfile([targetUID], event, api).catch(() => null) : null;
      author = (prof && (prof.name || (prof.username ? `@${prof.username}` : null))) || "Anonymous";
    } else {
      const q = DEFAULT_QUOTES[Math.floor(Math.random() * DEFAULT_QUOTES.length)];
      quote = q.quote;
      author = q.author;
    }

    if (!author || /^@?\d+$/.test(author.trim())) {
      author = "Anonymous";
    }

    if (message && typeof message.react === "function") {
      message.react("📜");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("📜", event.messageID, event.threadID, () => {}, true);
    }

    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Elegant dark gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#0f2027");
    grad.addColorStop(0.5, "#203a43");
    grad.addColorStop(1, "#2c5364");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative frame
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Quotation mark
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.font = 'bold 160px "Georgia", serif';
    ctx.fillText("“", 60, 160);

    // Quote text
    ctx.fillStyle = "#ffffff";
    ctx.font = 'italic 28px "Georgia", serif';
    ctx.textAlign = "center";

    // Word wrap
    const words = quote.split(" ");
    let line = "";
    const lines = [];
    const maxLineWidth = 640;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxLineWidth && i > 0) {
        lines.push(line);
        line = words[i] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    const startY = height / 2 - (lines.length * 20) + 10;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].trim(), width / 2, startY + (i * 38));
    }

    // Author
    ctx.font = 'bold 22px "Georgia", serif';
    ctx.fillStyle = "#f39c12";
    ctx.fillText(`— ${author}`, width / 2, startY + (lines.length * 38) + 30);

    const tempDir = path.join(process.cwd(), "temp");
    await fs.ensureDir(tempDir);
    const tempPath = path.join(tempDir, `quote_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
    await fs.writeFile(tempPath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

    const sent = await message.reply({
      body: `✨ "${quote}" — ${author}`,
      attachment: tempPath,
      textFirst: true
    });

    setTimeout(() => {
      fs.unlink(tempPath).catch(() => {});
    }, 20000);
    return sent;
  }
};
