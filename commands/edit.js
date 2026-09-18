"use strict";

/**
 * edit.js — AI Image Editing, Transformations, and Local Filters.
 * Author: 𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍 & lazyneoaz
 *
 * Capabilities:
 * - Edit an image by replying to a photo message: {p}edit <prompt>
 * - Edit or transform a user's profile picture: {p}edit -pfp [target] <prompt>
 * - Local filters: {p}edit [circle|grayscale|blur|sepia|invert|rotate|flip]
 */

const axios = require("axios");
const { Jimp } = require("jimp");
const fs = require("fs-extra");
const path = require("path");
const { resolveUserTarget, resolveProfile, extractImageUrl, findImageInMessage } = require("../src/utils");
const { safeLoadImage, createCanvas } = require("../func/canvasHelper");

const MAX_ATTACHMENT_BYTES = 35 * 1024 * 1024;

async function extractImageUrlFromEvent(event, args = [], api = null) {
  const extracted = await extractImageUrl(event, args, api);
  if (extracted) return extracted;

  const reply = event.messageReply || event.repliedMessage || event.replyToMessage || event.reply_to_message || event.replyTo || event.replied_to_message || event.replied_to_item || event.reply_to_item || event.quoted_item || (event.raw && (event.raw.messageReply || event.raw.repliedMessage || event.raw.replyToMessage || event.raw.replied_to_message || event.raw.replied_to_item));
  if (reply && typeof reply === "object") {
    const u = findImageInMessage(reply);
    if (u) return u;
  }

  const replyID = (reply && (reply.messageID || reply.item_id || reply.id || reply.mid)) ||
                  (typeof event.replyTo === "string" || typeof event.replyTo === "number" ? String(event.replyTo) : (event.replyTo && (event.replyTo.messageID || event.replyTo.item_id || event.replyTo.id))) ||
                  event.replyToItemId || event.replied_to_item_id || event.reply_to_item_id ||
                  event.replied_to_target_id || event.reply_to_target_id ||
                  (event.raw && (event.raw.replyTo || event.raw.replied_to_item_id || event.raw.replied_to_target_id));

  if (replyID) {
    const idStr = String(replyID);
    if (global.recentMessages && global.recentMessages.has(idStr)) {
      const cached = global.recentMessages.get(idStr);
      const u = findImageInMessage(cached);
      if (u) return u;
    }
    const icaRecent = (api && api._raw && api._raw.mqtt && api._raw.mqtt._recentMessages) || (api && api._recentMessages);
    if (icaRecent && icaRecent.has(idStr)) {
      const cached = icaRecent.get(idStr);
      const u = findImageInMessage(cached);
      if (u) return u;
    }
  }

  const curr = findImageInMessage(event);
  if (curr) return curr;

  if (event.raw && typeof event.raw === "object") {
    const rawU = findImageInMessage(event.raw);
    if (rawU) return rawU;
  }

  if (event.messageReply?.attachments?.length > 0) {
    for (const a of event.messageReply.attachments) {
      const u = a.url || a.largePreviewUrl || a.large_preview_url || a.previewUrl || a.preview_url || a.thumbnailUrl || a.image || a.photo || a.candidate?.url || a.candidates?.[0]?.url;
      if (u) return u;
    }
  }

  if (event.attachments?.length > 0) {
    for (const a of event.attachments) {
      const u = a.url || a.largePreviewUrl || a.large_preview_url || a.previewUrl || a.preview_url || a.thumbnailUrl || a.image || a.photo || a.candidate?.url || a.candidates?.[0]?.url;
      if (u) return u;
    }
  }

  if (event.messageReply && (event.messageReply.body || event.messageReply.text)) {
    const text = event.messageReply.body || event.messageReply.text;
    const m = text.match(/https?:\/\/[^\s]+/i);
    if (m) return m[0];
  }

  if (Array.isArray(args) && args.length > 0) {
    for (const a of args) {
      if (typeof a === "string" && /^https?:\/\//i.test(a)) return a;
    }
  }

  return null;
}

async function downloadToBuffer(fileUrl) {
  if (Buffer.isBuffer(fileUrl)) return fileUrl;
  if (typeof fileUrl === "string" && !/^https?:\/\//i.test(fileUrl) && fs.existsSync(fileUrl)) {
    return await fs.readFile(fileUrl);
  }
  const res = await axios.get(fileUrl, {
    responseType: "arraybuffer",
    timeout: 25000,
    maxContentLength: MAX_ATTACHMENT_BYTES,
    maxBodyLength: MAX_ATTACHMENT_BYTES,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  const buf = Buffer.from(res.data);
  if (buf.length > 50 && (buf.subarray(0, 50).toString().toLowerCase().includes("<html") || buf.subarray(0, 50).toString().toLowerCase().includes("<!doctype"))) {
    throw new Error("URL returned an HTML error response instead of image data");
  }
  return buf;
}

async function safeLoadJimp(source) {
  const buf = Buffer.isBuffer(source) ? source : await downloadToBuffer(source);
  try {
    return await Jimp.read(buf);
  } catch (err) {
    // If WebP or unsupported format by Jimp, decode via Skia/canvas and convert to JPEG buffer
    try {
      const img = await safeLoadImage(buf);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const jpegBuf = canvas.toBuffer("image/jpeg", { quality: 0.95 });
      return await Jimp.read(jpegBuf);
    } catch (innerErr) {
      throw new Error(`Failed to decode image: ${err.message || innerErr.message}`);
    }
  }
}

async function uploadImageToPublicHost(buffer) {
  const FormData = require("form-data");

  // 1. uguu.se (clean fast direct image file host)
  try {
    const form = new FormData();
    form.append("files[]", buffer, { filename: "edit.jpg" });
    const res = await axios.post("https://uguu.se/upload", form, {
      headers: { ...form.getHeaders(), "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 6000
    });
    const u = res.data?.files?.[0]?.url;
    if (u && typeof u === "string" && u.startsWith("http")) return u;
  } catch (_) {}

  // 2. tmpfiles.org (reliable direct download url)
  try {
    const form = new FormData();
    form.append("file", buffer, { filename: "edit.jpg" });
    const res = await axios.post("https://tmpfiles.org/api/v1/upload", form, {
      headers: form.getHeaders(),
      timeout: 6000
    });
    const rawUrl = res.data?.data?.url;
    if (rawUrl && typeof rawUrl === "string") {
      return rawUrl.replace("tmpfiles.org/", "tmpfiles.org/dl/");
    }
  } catch (_) {}

  // 3. qu.ax fallback
  try {
    const form = new FormData();
    form.append("files[]", buffer, { filename: "edit.jpg" });
    const res = await axios.post("https://qu.ax/upload.php", form, {
      headers: form.getHeaders(),
      timeout: 6000
    });
    const u = res.data?.files?.[0]?.url;
    if (u && typeof u === "string" && u.startsWith("http")) return u;
  } catch (_) {}

  // 4. freeimage.host fallback
  try {
    const form = new FormData();
    form.append("key", "6d207e02198a847aa98d0a2a901485a5");
    form.append("action", "upload");
    form.append("source", buffer.toString("base64"));
    form.append("format", "json");
    const res = await axios.post("https://freeimage.host/api/1/upload", form, {
      headers: form.getHeaders(),
      timeout: 7000
    });
    const url = res.data?.image?.url;
    if (url && typeof url === "string" && url.startsWith("http")) return url;
  } catch (_) {}

  return null;
}

module.exports = {
  config: {
    name: "edit",
    aliases: ["imgedit", "photoedit", "filterimg", "ai-edit", "transform"],
    version: "4.5.0",
    author: "frnAlt",
    cooldown: 5,
    role: 0,
    description: { en: "AI image editing, transformations, and local filters (reply to image or use -pfp)" },
    category: "image",
    usage: { en: "{p}edit <prompt> (reply to an image)\n{p}edit -pfp [@user|UID] <prompt>\n{p}edit [circle|blur|grayscale|sepia|invert|rotate|flip] (reply to image)" }
  },

  onStart: async function ({ api, event, args, message, logger, messageReply, replyTo, repliedMessage }) {
    if (!event.messageReply && (messageReply || repliedMessage || replyTo)) {
      event.messageReply = messageReply || repliedMessage || (typeof replyTo === "object" ? replyTo : null);
    }
    if (!event.repliedMessage && (repliedMessage || messageReply)) {
      event.repliedMessage = repliedMessage || messageReply;
    }

    const isPfpMode = args.some(a => ["-pfp", "--pfp", "-avatar", "--avatar", "-profile"].includes(String(a).toLowerCase()));

    let prompt = "";
    let imageUrl = null;
    let targetName = null;

    if (isPfpMode) {
      const rawArgs = args.filter(a => !["-pfp", "--pfp", "-avatar", "--avatar", "-profile"].includes(String(a).toLowerCase()));
      let targetId = null;
      let promptWords = [];

      // Priority 1: Reply to another user
      if (event.messageReply?.senderID) {
        targetId = String(event.messageReply.senderID);
        promptWords = rawArgs;
      } else {
        // Priority 2: Scan for explicit target (@mention, UID, or IG link)
        for (const arg of rawArgs) {
          if (/^@([A-Za-z0-9._]{1,30})$/.test(arg)) {
            if (!targetId) targetId = arg.replace(/^@/, "");
          } else if (/^\d{4,}$/.test(arg)) {
            if (!targetId) targetId = arg;
          } else if (/instagram\.com\/([A-Za-z0-9._]+)/i.test(arg)) {
            const m = arg.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
            if (!targetId && m) targetId = m[1];
          } else {
            promptWords.push(arg);
          }
        }
      }

      // Priority 3: Fall back to sender themselves
      if (!targetId) {
        targetId = String(event.senderID || "");
      }

      prompt = promptWords.join(" ").trim();
      if (!prompt) prompt = "enhance photo, high quality 4k portrait masterpiece";

      // Resolve profile
      if (targetId) {
        try {
          const profile = await resolveProfile([targetId], event, api);
          if (profile && profile.profilePicture) {
            imageUrl = profile.profilePicture;
            targetName = profile.name || profile.username || targetId;
          }
        } catch (_) {}

        if (!imageUrl && api && typeof api.getUserInfo === "function") {
          try {
            const info = await new Promise((res, rej) => api.getUserInfo(targetId, (e, r) => e ? rej(e) : res(r)));
            const p = info && (info[targetId] || Object.values(info)[0]);
            if (p && p.profilePicture) {
              imageUrl = p.profilePicture;
              targetName = p.name || p.username || targetId;
            }
          } catch (_) {}
        }
      }

      if (!imageUrl) {
        return message.reply(`❌ Could not fetch profile picture for user ${targetId || "target"}. Please ensure the profile is accessible.`);
      }
    } else {
      imageUrl = await extractImageUrlFromEvent(event, args, api);
      const promptArgs = (args || []).filter(a => typeof a === "string" && a !== imageUrl && !/^https?:\/\//i.test(a));
      prompt = promptArgs.join(" ").trim();
    }

    if (!imageUrl) {
      return message.reply(
        "📸 𝗣𝗵𝗼𝘁𝗼 & 𝗣𝗙𝗣 𝗘𝗱𝗶𝘁𝗼𝗿\n\n" +
        "📌 Usage:\n" +
        "• Reply to any image message with: {p}edit <prompt>\n" +
        "• Edit your own profile picture: {p}edit -pfp <prompt>\n" +
        "• Edit another user's profile picture: {p}edit -pfp @user <prompt>\n" +
        "• Canvas filters: {p}edit [circle|grayscale|blur|sepia|invert|rotate|flip]\n\n" +
        "💡 Example: {p}edit -pfp cyberpunk anime portrait"
      );
    }

    if (!prompt && !isPfpMode) {
      return message.reply(
        "⚠️ Please provide an edit prompt or effect instruction.\n\n" +
        "💡 Example: (reply to photo) {p}edit cyberpunk style\n" +
        "💡 Canvas filters: circle, rounded, blur, grayscale, sepia, invert, rotate, flip, resize"
      );
    }

    if (message && typeof message.react === "function") {
      message.react("⏳").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⏳", event.messageID, event.threadID, () => {}, true);
    }

    const CANVAS_ACTIONS = [
      "circle", "rounded", "resize", "rotate", "flip",
      "blur", "grayscale", "greyscale", "sepia", "invert",
      "brightness", "contrast"
    ];
    const firstWord = (prompt.split(/\s+/)[0] || "").toLowerCase();
    const isCanvasAction = CANVAS_ACTIONS.includes(firstWord);

    let tempFilePath = null;

    try {
      let finalBuffer = null;
      let appliedType = "AI Edit";

      // 1. Local Canvas Filter Processing
      if (isCanvasAction) {
        appliedType = `Canvas: ${firstWord.toUpperCase()}`;
        const action = firstWord;
        const actionArgs = prompt.split(/\s+/).slice(1);

        const sourceBuffer = await downloadToBuffer(imageUrl);
        const jimg = await safeLoadJimp(sourceBuffer);

        if (action === "circle" || action === "rounded") {
          jimg.circle();
        } else if (action === "grayscale" || action === "greyscale") {
          jimg.greyscale();
        } else if (action === "sepia") {
          jimg.sepia();
        } else if (action === "invert") {
          jimg.invert();
        } else if (action === "blur") {
          const radius = parseInt(actionArgs[0], 10) || 10;
          jimg.blur(Math.min(25, Math.max(1, radius)));
        } else if (action === "rotate") {
          const deg = parseInt(actionArgs[0], 10) || 90;
          jimg.rotate(deg);
        } else if (action === "flip") {
          const vertical = (actionArgs[0] || "").toLowerCase().startsWith("v");
          jimg.flip({ horizontal: !vertical, vertical });
        } else if (action === "resize" && actionArgs[0] && actionArgs[1]) {
          const w = parseInt(actionArgs[0], 10) || 512;
          const h = parseInt(actionArgs[1], 10) || 512;
          jimg.resize({ w: Math.min(1920, w), h: Math.min(1920, h) });
        } else if (action === "brightness") {
          const val = parseInt(actionArgs[0], 10) || 20;
          jimg.color([{ apply: val >= 0 ? "brighten" : "darken", params: [Math.abs(val)] }]);
        } else if (action === "contrast") {
          const val = parseFloat(actionArgs[0]) || 0.3;
          jimg.contrast(Math.min(1, Math.max(-1, val)));
        }

        finalBuffer = await jimg.getBuffer("image/jpeg");
      }

      // 2. Primary AI Edit API
      let generatedUrl = null;

      if (!finalBuffer) {
        let sourceBuffer = null;
        let targetUrl = imageUrl;

        const isProtectedHost = !/^https?:\/\//i.test(targetUrl) ||
          /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(targetUrl);

        // If the URL is an Instagram/Facebook CDN or local file, relay it through our direct public host first
        if (isProtectedHost) {
          try {
            sourceBuffer = await downloadToBuffer(imageUrl);
            const uploadedUrl = await uploadImageToPublicHost(sourceBuffer);
            if (uploadedUrl) {
              targetUrl = uploadedUrl;
            }
          } catch (e) {
            logger?.warn?.(`[EDIT] Failed to relay image to public host: ${e.message}`);
          }
        }

        // Call Toshiro AI edit API
        try {
          const editApiUrl = `https://toshiro-api-editz6t9.vercel.app/api/image/edit?url=${encodeURIComponent(targetUrl)}&prompt=${encodeURIComponent(prompt)}`;
          const editRes = await axios.get(editApiUrl, { timeout: 6000 });
          if (editRes.data?.success && editRes.data?.url) {
            generatedUrl = editRes.data.url;
            try {
              finalBuffer = await downloadToBuffer(generatedUrl);
              appliedType = "AI Edit";
            } catch (_) {}
          }
        } catch (e) {
          logger?.warn?.(`[EDIT] Initial Toshiro call failed: ${e.message}`);
        }

        // If direct attempt failed (e.g. targetUrl wasn't flagged as protected but external fetch failed),
        // download locally and upload to public host, then retry Toshiro
        if (!finalBuffer && !generatedUrl) {
          try {
            if (!sourceBuffer) {
              sourceBuffer = await downloadToBuffer(imageUrl).catch(() => null);
            }
            if (sourceBuffer) {
              const uploadedUrl = await uploadImageToPublicHost(sourceBuffer);
              if (uploadedUrl && uploadedUrl !== targetUrl) {
                targetUrl = uploadedUrl;
                const editApiUrl = `https://toshiro-api-editz6t9.vercel.app/api/image/edit?url=${encodeURIComponent(targetUrl)}&prompt=${encodeURIComponent(prompt)}`;
                const editRes = await axios.get(editApiUrl, { timeout: 6000 });
                if (editRes.data?.success && editRes.data?.url) {
                  generatedUrl = editRes.data.url;
                  try {
                    finalBuffer = await downloadToBuffer(generatedUrl);
                    appliedType = "AI Edit";
                  } catch (_) {}
                }
              }
            }
          } catch (e) {
            logger?.warn?.(`[EDIT] Toshiro retry attempt failed: ${e.message}`);
          }
        }

        // 3. Fallback: Pollinations Image-to-Image / Variation
        if (!finalBuffer) {
          try {
            if (!targetUrl || /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(targetUrl) || !/^https?:\/\//i.test(targetUrl)) {
              if (!sourceBuffer) {
                sourceBuffer = await downloadToBuffer(imageUrl).catch(() => null);
              }
              if (sourceBuffer) {
                const uploadedUrl = await uploadImageToPublicHost(sourceBuffer);
                if (uploadedUrl) targetUrl = uploadedUrl;
              }
            }
            const seed = Math.floor(Math.random() * 1000000);
            const turboUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?image=${encodeURIComponent(targetUrl)}&width=768&height=768&seed=${seed}&model=turbo&nologo=true`;
            generatedUrl = turboUrl;
            appliedType = "AI Turbo Edit";
            try {
              finalBuffer = await downloadToBuffer(turboUrl);
            } catch (_) {}
          } catch (_) {}
        }

        // 4. Final Fallback: Jimp Image Adjustment on original image
        if (!finalBuffer) {
          try {
            if (!sourceBuffer) {
              sourceBuffer = await downloadToBuffer(imageUrl).catch(() => null);
            }
            if (sourceBuffer) {
              const jimg = await safeLoadJimp(sourceBuffer);
              jimg.contrast(0.2);
              finalBuffer = await jimg.getBuffer("image/jpeg");
              appliedType = "Enhanced Edit";
            }
          } catch (_) {}
        }
      }

      if (!finalBuffer && !generatedUrl) {
        throw new Error("Could not produce edited image.");
      }

      if (finalBuffer && Buffer.isBuffer(finalBuffer)) {
        let outputBuffer = finalBuffer;
        const isJpeg = finalBuffer.length > 3 && finalBuffer[0] === 0xFF && finalBuffer[1] === 0xD8;
        if (!isJpeg) {
          try {
            const jimg = await safeLoadJimp(finalBuffer);
            outputBuffer = await jimg.getBuffer("image/jpeg");
          } catch (_) {
            try {
              const img = await safeLoadImage(finalBuffer);
              const canvas = createCanvas(img.width, img.height);
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0);
              outputBuffer = canvas.toBuffer("image/jpeg");
            } catch (_) {}
          }
        }
        const tempDir = path.join(process.cwd(), "temp");
        await fs.ensureDir(tempDir);
        tempFilePath = path.join(tempDir, `edit_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
        await fs.writeFile(tempFilePath, outputBuffer);
      }

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      let deliveryError = null;
      let sent = null;

      // Primary attempt: send media attachment as reply
      if (tempFilePath) {
        try {
          sent = await message.reply({
            attachment: tempFilePath,
            textFirst: false
          });
        } catch (replyErr) {
          // Fallback: send directly to thread if reply is rejected
          try {
            if (message && typeof message.send === "function") {
              sent = await message.send({
                attachment: tempFilePath,
                textFirst: false
              });
            } else if (api && typeof api.sendMessage === "function") {
              sent = await api.sendMessage({
                attachment: tempFilePath,
                textFirst: false
              }, event.threadID);
            } else {
              deliveryError = replyErr;
            }
          } catch (sendErr) {
            deliveryError = sendErr;
          }
        }
      } else {
        deliveryError = new Error("No local file available for attachment delivery");
      }

      // If media attachment upload failed, attempt delivery of generatedUrl as attachment
      if (deliveryError && generatedUrl) {
        try {
          sent = await message.reply({ attachment: generatedUrl, textFirst: false });
          deliveryError = null;
        } catch (_) {
          try {
            if (message && typeof message.send === "function") {
              sent = await message.send({ attachment: generatedUrl, textFirst: false });
              deliveryError = null;
            } else if (api && typeof api.sendMessage === "function") {
              sent = await api.sendMessage({ attachment: generatedUrl, textFirst: false }, event.threadID);
              deliveryError = null;
            }
          } catch (_) {}
        }
      }

      // If media attachment cannot be delivered, fall back to direct URL message
      if (deliveryError) {
        if (generatedUrl) {
          try {
            sent = await message.reply(`🔗 View / Download Image:\n${generatedUrl}`);
          } catch (_) {
            if (message && typeof message.send === "function") {
              sent = await message.send(`🔗 View / Download Image:\n${generatedUrl}`);
            } else if (api && typeof api.sendMessage === "function") {
              sent = await api.sendMessage(`🔗 View / Download Image:\n${generatedUrl}`, event.threadID);
            }
          }
        } else {
          throw deliveryError;
        }
      }

      // Cleanup temp file safely after short delay
      if (tempFilePath) {
        setTimeout(() => {
          fs.unlink(tempFilePath).catch(() => {});
        }, 20000);
      }

      return sent;
    } catch (err) {
      if (tempFilePath) fs.unlink(tempFilePath).catch(() => {});
      if (message && typeof message.react === "function") {
        message.react("❌").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      }
      const errMsg = `❌ Failed to edit image: ${err.message || err}`;
      try {
        return await message.reply(errMsg);
      } catch (_) {
        try {
          if (message && typeof message.send === "function") {
            return await message.send(errMsg);
          } else if (api && typeof api.sendMessage === "function") {
            return await api.sendMessage(errMsg, event.threadID);
          }
        } catch (_) {}
      }
    }
  }
};
