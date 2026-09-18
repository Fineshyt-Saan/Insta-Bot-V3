"use strict";

/**
 * Universal Media Downloader Command (alldl)
 * Downloads video/audio from TikTok, YouTube, Instagram, Facebook, Twitter, and other platforms.
 */

const axios = require("axios");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs-extra");
const path = require("path");

const { extractMediaUrl } = require("../src/utils");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_BYTES = Math.max(256 * 1024, Number(process.env.IG_MAX_MEDIA_BYTES) || 45 * 1024 * 1024);

async function downloadMediaBuffer(url) {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*"
  };
  try {
    if (new URL(url).hostname.includes("tiktok")) headers.Referer = "https://www.tiktok.com/";
  } catch (_) {}

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 25000,
      maxContentLength: MAX_BYTES,
      headers
    });
    if (res.status === 200 && res.data && res.data.length > 0) {
      return Buffer.from(res.data);
    }
  } catch (err) {
    if (headers.Referer) {
      delete headers.Referer;
      const retryRes = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 25000,
        maxContentLength: MAX_BYTES,
        headers
      });
      if (retryRes.status === 200 && retryRes.data && retryRes.data.length > 0) {
        return Buffer.from(retryRes.data);
      }
    }
    throw err;
  }
  throw new Error("Empty response from media CDN");
}

module.exports = {
  config: {
    name: "alldl",
    aliases: ["download", "dl", "getmedia", "anydl"],
    version: "2.5.0",
    author: "Gtajisan & 𝐒𝐀𝐀𝐍 𝐄𝐗𝐇𝐀𝐔𝐒𝐓𝐄𝐃 & lazyneoaz",
    cooldown: 5,
    role: 0,
    shortDescription: {
      en: "Universal media downloader for social links"
    },
    longDescription: {
      en: "Downloads video or audio from TikTok, YouTube, Instagram, Facebook, Pinterest, Twitter/X and 40+ platforms."
    },
    category: "media",
    usage: "{p}alldl <url> [--audio]\nReply to a message with a link: {p}alldl [--audio]"
  },

  onStart: async function ({ message, args, event, api, commandName }) {
    const threadID = event.threadId || event.threadID;
    let url = args.find(a => /^https?:\/\//i.test(a));
    let isAudio = args.includes("--audio") || args.includes("--a") || args.includes("-a");

    const reply = event.messageReply || event.repliedMessage;
    if (!url && reply && (reply.body || reply.text)) {
      const text = reply.body || reply.text;
      const urlMatch = text.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        url = urlMatch[0];
      }
    }
    if (!url) {
      url = extractMediaUrl(event, args);
    }

    if (!url) {
      const prompt = "📥 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗮𝗹 𝗠𝗲𝗱𝗶𝗮 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗿\n\n📌 Usage:\n• {p}alldl <url>\n• {p}alldl <url> --audio\n• Reply to any message containing a video link with {p}alldl\n\n💡 Supported: TikTok, YouTube, Instagram, Facebook, Twitter/X, Pinterest, Reddit, etc.";
      return message ? message.reply(prompt) : api.sendMessage(prompt, threadID);
    }

    if (message && typeof message.react === "function") {
      message.react("⏳");
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    let tempFilePath = null;

    try {
      let downloadUrl = null;
      let title = "Media Download";

      // 1. YouTube Native Direct Stream Fast-Path
      if (ytdl.validateURL(url)) {
        try {
          const tempDir = path.join(process.cwd(), "temp");
          await fs.ensureDir(tempDir);
          tempFilePath = path.join(tempDir, `alldl_${Date.now()}_${Math.random().toString(36).substring(7)}.${isAudio ? "mp3" : "mp4"}`);
          const stream = ytdl(url, {
            filter: isAudio ? "audioonly" : "videoandaudio",
            quality: isAudio ? "highestaudio" : "highestvideo"
          });
          const writer = fs.createWriteStream(tempFilePath);
          stream.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
            stream.on("error", reject);
          });
          if ((await fs.stat(tempFilePath)).size > 1000) {
            title = "YouTube Media";
          } else {
            await fs.unlink(tempFilePath).catch(() => {});
            tempFilePath = null;
          }
        } catch (_) {
          if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
          tempFilePath = null;
        }
      }

      // 2. TikTok Fast Path
      if (!downloadUrl && !tempFilePath && /tiktok\.com/i.test(url)) {
        try {
          const ttRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 12000 });
          const ttData = ttRes.data?.data;
          if (ttData) {
            downloadUrl = isAudio ? (ttData.music || ttData.play) : (ttData.play || ttData.wmplay);
            title = ttData.title || "TikTok Video";
          }
        } catch (_) {}
      }

      // 3. NeoKEX AllDL Universal API
      if (!downloadUrl && !tempFilePath) {
        try {
          const neoRes = await axios.get(`https://alldl.neokex.xyz/api/alldl?url=${encodeURIComponent(url)}`, { timeout: 20000 });
          const data = (neoRes.data && (neoRes.data.metadata?.data || neoRes.data.data)) || neoRes.data;
          const downloads = (data && data.downloads) || [];
          if (downloads.length > 0) {
            if (isAudio) {
              const dl = downloads.find(d => String(d.label || d.ext).toLowerCase().includes("audio") || d.ext === "mp3") || downloads[0];
              downloadUrl = dl.url;
            } else {
              const dl = downloads.find(d => d.ext === "mp4" && !String(d.label).toLowerCase().includes("audio")) || downloads.find(d => !String(d.label).toLowerCase().includes("audio")) || downloads[0];
              downloadUrl = dl.url;
            }
            title = data.title || title;
          }
        } catch (_) {}
      }

      // 4. Kaiz API
      if (!downloadUrl && !tempFilePath) {
        try {
          const kaizRes = await axios.get(`https://kaiz-apis.gleeze.com/api/alldl?url=${encodeURIComponent(url)}`, { timeout: 20000 });
          const d = kaizRes.data;
          if (d) {
            downloadUrl = isAudio ? (d.audio || d.url || d.video) : (d.video || d.url || d.hd || d.sd);
            title = d.title || title;
          }
        } catch (_) {}
      }

      // 5. Siputzx Universal API
      if (!downloadUrl && !tempFilePath) {
        try {
          const sipRes = await axios.get(`https://api.siputzx.my.id/api/d/all?url=${encodeURIComponent(url)}`, { timeout: 15000 });
          const data = sipRes.data?.data || sipRes.data?.result;
          if (data) {
            downloadUrl = isAudio ? (data.audio || data.url || data.video) : (data.video || data.url || data.hd || data.sd);
            title = data.title || title;
          }
        } catch (_) {}
      }

      // 6. Cobalt API
      if (!downloadUrl && !tempFilePath) {
        try {
          const cobRes = await axios.post(`https://api.cobalt.tools/api/json`, {
            url,
            downloadMode: isAudio ? "audio" : "auto"
          }, {
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            timeout: 15000
          });
          if (cobRes.data?.url) {
            downloadUrl = cobRes.data.url;
          }
        } catch (_) {}
      }

      if (!downloadUrl && !tempFilePath) {
        throw new Error("Unable to extract downloadable stream from this URL");
      }

      if (!tempFilePath && downloadUrl) {
        try {
          const ext = isAudio ? "mp3" : "mp4";
          const tempDir = path.join(process.cwd(), "temp");
          await fs.ensureDir(tempDir);
          tempFilePath = path.join(tempDir, `alldl_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);
          const buf = await downloadMediaBuffer(downloadUrl);
          await fs.writeFile(tempFilePath, buf);
        } catch (_) {
          if (tempFilePath) {
            await fs.unlink(tempFilePath).catch(() => {});
            tempFilePath = null;
          }
        }
      }

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const attachment = tempFilePath
        ? { path: tempFilePath, type: isAudio ? "audio" : "video" }
        : { url: downloadUrl, type: isAudio ? "audio" : "video" };

      let sent = null;
      try {
        sent = await message.reply({
          attachment,
          textFirst: false
        });
      } catch (replyErr) {
        try {
          if (message && typeof message.send === "function") {
            sent = await message.send({
              attachment,
              textFirst: false
            });
          } else if (api && typeof api.sendMessage === "function") {
            sent = await api.sendMessage({
              attachment,
              textFirst: false
            }, threadID);
          } else {
            throw replyErr;
          }
        } catch (sendErr) {
          throw sendErr;
        }
      }

      if (tempFilePath) {
        setTimeout(() => fs.unlink(tempFilePath).catch(() => {}), 25000);
      }

      return sent;
    } catch (err) {
      if (tempFilePath) fs.unlink(tempFilePath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      const errMsg = `❌ Download failed: ${err.message}. Please check if the link is public and valid.`;
      try {
        return await message.reply(errMsg);
      } catch (_) {
        if (message && typeof message.send === "function") {
          return await message.send(errMsg);
        } else if (api && typeof api.sendMessage === "function") {
          return await api.sendMessage(errMsg, threadID);
        }
      }
    }
  },

  run: async function (params) {
    return module.exports.onStart(params);
  }
};
