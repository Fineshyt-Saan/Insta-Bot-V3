/**
 * Catbox File Uploader Command
 * Uploads media and files to Catbox.moe
 */

const axios = require('axios');
const FormData = require('form-data');

module.exports = {
  config: {
    name: 'catbox',
    aliases: ['cb', 'catboxdl', 'upload', 'up', 'upfile'],
    version: '1.2.0',
    author: '𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍',
    role: 0,
    shortDescription: {
      en: 'Upload media to Catbox'
    },
    longDescription: {
      en: 'Uploads images, videos, audio, and documents to Catbox cloud hosting.'
    },
    category: 'media',
    usage: '{p}catbox (reply to media/file)'
  },

  onStart: async function ({ api, event, message, args }) {
    const threadID = event.threadId || event.threadID;

    let targets = [];
    const reply = event.messageReply || event.repliedMessage;
    if (reply?.attachments?.length > 0) {
      targets = reply.attachments;
    } else if (event.attachments?.length > 0) {
      targets = event.attachments;
    }

    let urlList = targets.map(t => t.url || t.largePreviewUrl || t.previewUrl || t.image).filter(Boolean);
    if (urlList.length === 0 && reply?.url) {
      urlList.push(reply.url);
    }
    if (urlList.length === 0 && Array.isArray(args) && args.length > 0) {
      for (const a of args) {
        if (typeof a === "string" && /^https?:\/\//i.test(a)) urlList.push(a);
      }
    }

    if (urlList.length === 0) {
      const prompt = "📦 𝗙𝗶𝗹𝗲 & 𝗠𝗲𝗱𝗶𝗮 𝗨𝗽𝗹𝗼𝗮𝗱𝗲𝗿 (Catbox)\n\n📌 Usage:\n• Reply to any photo, video, or audio with {p}upload\n• Or: {p}upload <direct_url>";
      return message ? message.reply(prompt) : api.sendMessage(prompt, threadID);
    }

    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    }

    try {
      const results = [];
      for (const mediaUrl of urlList) {
        const dlRes = await axios.get(mediaUrl, {
          responseType: "arraybuffer",
          timeout: 40000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        const buf = Buffer.from(dlRes.data);
        const contentType = dlRes.headers["content-type"] || "";
        let ext = "jpg";
        if (contentType.includes("video/mp4") || mediaUrl.includes(".mp4")) ext = "mp4";
        else if (contentType.includes("audio") || mediaUrl.includes(".mp3")) ext = "mp3";
        else if (contentType.includes("png") || mediaUrl.includes(".png")) ext = "png";
        else if (contentType.includes("gif") || mediaUrl.includes(".gif")) ext = "gif";
        else if (contentType.includes("webp") || mediaUrl.includes(".webp")) ext = "webp";

        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", buf, { filename: `upload_${Date.now()}.${ext}` });

        const response = await axios.post("https://catbox.moe/user/api.php", form, {
          headers: form.getHeaders(),
          timeout: 30000
        });

        if (typeof response.data === "string" && response.data.startsWith("http")) {
          results.push(response.data.trim());
        }
      }

      if (results.length === 0) {
        throw new Error("Upload to Catbox failed — service did not return a valid URL.");
      }

      if (message && typeof message.react === "function") message.react("✅").catch(() => {});
      const replyMsg = `🐱 𝗖𝗮𝘁𝗯𝗼𝘅 𝗟𝗶𝗻𝗸(𝘀):\n\n${results.join("\n")}`;
      return message ? message.reply(replyMsg) : api.sendMessage(replyMsg, threadID);
    } catch (err) {
      if (message && typeof message.react === "function") message.react("❌").catch(() => {});
      const errMsg = `❌ Upload failed: ${err.message}`;
      return message ? message.reply(errMsg) : api.sendMessage(errMsg, threadID);
    }
  },

  run: async function (params) {
    return module.exports.onStart(params);
  }
};
