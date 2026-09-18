"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

module.exports = {
  config: {
    name: "say",
    aliases: ["sy", "tts", "speak"],
    version: "4.6.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "fun",
    description: { en: "Speak text with anime, celebrity, or language voices" },
    usage: { en: "{p}say <text> | {p}say <voice> <text> | {p}say <text> | <lang_code>" }
  },

  onStart: async function ({ api, args, message, event }) {
    let replyText = (event.messageReply && (event.messageReply.body || event.messageReply.text)) ||
                    (event.repliedMessage && (event.repliedMessage.body || event.repliedMessage.text)) || "";

    let text = "";
    let voiceOrText = "";
    let langMode = false;

    if (args.length === 0) {
      if (replyText) {
        text = replyText;
        voiceOrText = "random";
      } else {
        return message.reply("Usage: {p}say <text> | {p}say <voice> <text>");
      }
    } else if (args.join(" ").includes("|")) {
      const splitArgs = args.join(" ").split("|").map(arg => arg.trim());
      text = splitArgs[0];
      voiceOrText = splitArgs[1] || "en";
      langMode = true;
    } else {
      voiceOrText = args[0].toLowerCase();
      text = args.slice(1).join(" ").trim();
      if (!text && replyText) {
        text = replyText;
      } else if (!text) {
        text = voiceOrText;
        voiceOrText = "random";
      }
    }

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    const tempDir = path.join(process.cwd(), "temp");
    await fs.ensureDir(tempDir);
    const tempPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

    try {
      const characterVoices = {
        goku: "ja", vegeta: "ja", naruto: "ja", sasuke: "ja", luffy: "ja",
        zoro: "ja", itachi: "ja", tanjiro: "ja", nezuko: "ja", mikasa: "ja",
        eren: "ja", levi: "ja", saitama: "ja", trump: "en", obama: "en",
        elon: "en", biden: "en", putin: "ru"
      };

      if (voiceOrText === "random") {
        const availableVoices = Object.keys(characterVoices);
        voiceOrText = availableVoices[Math.floor(Math.random() * availableVoices.length)];
      }

      const lang = characterVoices[voiceOrText] || ((langMode || voiceOrText.length <= 3) ? voiceOrText : "en");
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text.slice(0, 300))}`;

      try {
        const res = await axios({
          method: "get",
          url: audioUrl,
          responseType: "arraybuffer",
          headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
          timeout: 15000
        });
        await fs.writeFile(tempPath, Buffer.from(res.data));
      } catch (_) {
        const fallbackUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=${lang}&client=gtx&q=${encodeURIComponent(text.slice(0, 300))}`;
        const res = await axios({
          method: "get",
          url: fallbackUrl,
          responseType: "arraybuffer",
          headers: { "User-Agent": UA },
          timeout: 15000
        });
        await fs.writeFile(tempPath, Buffer.from(res.data));
      }

      if (message && typeof message.react === "function") {
        message.react("✅");
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      let sent;
      try {
        if (typeof api.sendVoice === "function") {
          sent = await api.sendVoice(event.threadID, tempPath, { replyToMessageID: event.messageID });
        } else if (typeof message.reply === "function") {
          sent = await message.reply({
            attachment: { path: tempPath, type: "audio" }
          });
        } else {
          sent = await message.send({
            attachment: { path: tempPath, type: "audio" }
          });
        }
      } catch (_) {
        try {
          sent = await message.reply({
            attachment: { path: tempPath, type: "audio" }
          });
        } catch (e) {
          sent = null;
        }
      }

      setTimeout(() => fs.unlink(tempPath).catch(() => {}), 20000);
      return sent;
    } catch (err) {
      await fs.unlink(tempPath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        try { api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true); } catch (_) {}
      }
      try {
        return await (message.reply ? message.reply(`❌ Error: ${err.message || "Failed to generate voice."}`) : message.send(`❌ Error: ${err.message || "Failed to generate voice."}`));
      } catch (_) {}
    }
  },

  run: async function (params) {
    return module.exports.onStart(params);
  }
};
