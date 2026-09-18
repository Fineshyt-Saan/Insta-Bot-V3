"use strict";

/**
 * Universal High-Performance Canvas Helper for Floppa-Chatbot & InstaBOT
 * Bridges @napi-rs/canvas (preferred, full WebP/AVIF/PNG/JPEG support)
 * and legacy node-canvas gracefully with bulletproof decoding & fallback mechanisms.
 */

const path = require("path");

let createCanvas = null;
let loadImage = null;
let registerFont = null;
let GlobalFonts = null;
let isCanvasAvailable = false;

// 1. Try @napi-rs/canvas first (superior performance, native WebP/AVIF/SVG decoding)
try {
  const napi = require("@napi-rs/canvas");
  const cFunc = napi.createCanvas || napi.default?.createCanvas;
  const lFunc = napi.loadImage || napi.default?.loadImage;
  if (typeof cFunc === "function" && typeof lFunc === "function") {
    createCanvas = cFunc;
    loadImage = lFunc;
    GlobalFonts = napi.GlobalFonts || napi.default?.GlobalFonts || null;
    registerFont = (fontPath, options) => {
      if (!fontPath) return false;
      const family = typeof options === "string" ? options : (options && options.family ? options.family : undefined);
      if (GlobalFonts?.registerFromPath) {
        try {
          return GlobalFonts.registerFromPath(fontPath, family);
        } catch (_) {
          return false;
        }
      }
      return false;
    };
    isCanvasAvailable = true;
  }
} catch (_) {}

// 2. Try node-canvas (fallback)
if (!isCanvasAvailable) {
  try {
    const nodeCanvas = require("canvas");
    const cFunc = nodeCanvas.createCanvas || nodeCanvas.default?.createCanvas;
    const lFunc = nodeCanvas.loadImage || nodeCanvas.default?.loadImage;
    if (typeof cFunc === "function" && typeof lFunc === "function") {
      createCanvas = cFunc;
      loadImage = lFunc;
      registerFont = nodeCanvas.registerFont ? nodeCanvas.registerFont.bind(nodeCanvas) : null;
      GlobalFonts = {
        registerFromPath(fontPath, name) {
          if (registerFont) registerFont(fontPath, { family: name });
        },
        has() { return false; },
        getFamilies() { return []; },
        loadSystemFonts() {},
        loadFontsFromDir() {}
      };
      isCanvasAvailable = true;
    }
  } catch (_) {}
}

/**
 * Safely load an image from URL, Buffer, or file path.
 * Resolves browser headers to prevent CDN 403 blocks and protects against HTML error pages.
 */
async function safeLoadImage(source, options = {}) {
  if (!isCanvasAvailable || typeof loadImage !== "function") {
    if (options.fallbackName) {
      return createDefaultAvatar(options.fallbackName, options.size || 500);
    }
    throw new Error("Canvas is not available on this platform");
  }

  if (!source) {
    if (options.fallbackName) {
      return createDefaultAvatar(options.fallbackName, options.size || 500);
    }
    throw new Error("No image source provided");
  }

  try {
    // 1. If HTTP(S) URL, download with axios using realistic browser headers
    if (typeof source === "string" && /^https?:\/\//i.test(source)) {
      const axios = require("axios");
      const res = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: options.timeout || 15000,
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      });
      const buf = Buffer.from(res.data);
      if (!buf || buf.length === 0) throw new Error("Empty image response");

      // Guard against HTML error response (e.g. 403 Forbidden CDN page)
      const head = buf.slice(0, 40).toString("utf8").toLowerCase();
      if (head.includes("<html") || head.includes("<!doctype") || head.includes("<?xml")) {
        throw new Error("Remote server returned HTML error page instead of image");
      }
      return await loadImage(buf);
    }

    // 2. If Buffer or Uint8Array
    if (Buffer.isBuffer(source) || source instanceof Uint8Array) {
      const buf = Buffer.isBuffer(source) ? source : Buffer.from(source);
      if (buf.length === 0) throw new Error("Empty image buffer");
      const head = buf.slice(0, 40).toString("utf8").toLowerCase();
      if (head.includes("<html") || head.includes("<!doctype") || head.includes("<?xml")) {
        throw new Error("Invalid image buffer: contains HTML content");
      }
      return await loadImage(buf);
    }

    // 3. If local file path
    if (typeof source === "string") {
      const fs = require("fs-extra");
      if (!fs.existsSync(source)) {
        throw new Error(`Local image file not found: ${source}`);
      }
      return await loadImage(source);
    }

    // 4. Fallback direct call
    return await loadImage(source);
  } catch (err) {
    if (options.fallbackName) {
      return createDefaultAvatar(options.fallbackName, options.size || 500);
    }
    throw new Error(`Failed to load image: ${err.message}`);
  }
}

/**
 * Creates a clean, modern gradient avatar canvas with the user's initial.
 */
function createDefaultAvatar(name = "User", size = 500) {
  if (!isCanvasAvailable || typeof createCanvas !== "function") return null;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Modern vibrant gradient palettes
  const palettes = [
    ["#4158D0", "#C850C0", "#FFCC70"],
    ["#FA8BFF", "#2BD2FF", "#2BFF88"],
    ["#FBAB7E", "#F7CE68"],
    ["#85FFBD", "#FFFB7D"],
    ["#8EC5FC", "#E0C3FC"],
    ["#FF9A8B", "#FF6A88", "#FF99AC"],
    ["#1e3c72", "#2a5298"]
  ];
  const charCode = (name && name[0] ? name.charCodeAt(0) : 65);
  const selectedPalette = palettes[charCode % palettes.length];

  const grad = ctx.createLinearGradient(0, 0, size, size);
  selectedPalette.forEach((c, idx) => {
    grad.addColorStop(idx / (selectedPalette.length - 1 || 1), c);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle circular inner glow
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Initial letter
  const initial = (name ? String(name).trim()[0] : "?").toUpperCase();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.round(size * 0.05);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(size * 0.02);
  ctx.fillText(initial, size / 2, size / 2 + Math.round(size * 0.02));

  return canvas;
}

/**
 * Bulletproof avatar loader:
 * Attempts to load from URL or Buffer.
 * If null, expired, 403, corrupt, or unsupported format, ALWAYS returns a sleek default avatar.
 * NEVER throws, NEVER returns null!
 */
async function loadAvatarOrFallback(urlOrBuffer, fallbackName = "User", size = 500) {
  if (!urlOrBuffer) {
    return createDefaultAvatar(fallbackName, size);
  }

  try {
    const loaded = await safeLoadImage(urlOrBuffer, { fallbackName, size, timeout: 12000 });
    if (loaded) return loaded;
  } catch (_) {}

  return createDefaultAvatar(fallbackName, size);
}

/**
 * Prison jail effect renderer
 */
async function renderJailEffect(imageSource) {
  if (!isCanvasAvailable || typeof createCanvas !== "function") {
    throw new Error("Canvas is not available on this platform");
  }

  const img = await safeLoadImage(imageSource, { fallbackName: "Prisoner", size: 600 });
  const width = img.width || 512;
  const height = img.height || 512;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Draw original image
  ctx.drawImage(img, 0, 0, width, height);

  // 2. Prison bars configuration
  const barCount = Math.max(5, Math.floor(width / 70));
  const barWidth = Math.max(8, Math.floor(width / 36));
  const spacing = width / (barCount + 1);

  // 3. Horizontal support crossbars
  const horizY = [height * 0.18, height * 0.82];
  const horizHeight = Math.max(10, Math.floor(barWidth * 1.1));

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  for (const y of horizY) {
    ctx.fillRect(0, y - horizHeight / 2 + 4, width, horizHeight);
  }
  for (const y of horizY) {
    ctx.fillStyle = "#2d3436";
    ctx.fillRect(0, y - horizHeight / 2, width, horizHeight);
    ctx.fillStyle = "#636e72";
    ctx.fillRect(0, y - horizHeight / 2 + 2, width, Math.max(2, Math.floor(horizHeight * 0.25)));
  }

  // 4. Vertical iron bars
  for (let i = 1; i <= barCount; i++) {
    const x = Math.round(i * spacing - barWidth / 2);

    // Drop shadow behind bar
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(x + Math.max(3, Math.floor(barWidth * 0.25)), 0, barWidth, height);

    // Main steel iron bar
    ctx.fillStyle = "#2d3436";
    ctx.fillRect(x, 0, barWidth, height);

    // Highlight stripe
    ctx.fillStyle = "#636e72";
    ctx.fillRect(x + Math.floor(barWidth * 0.2), 0, Math.max(2, Math.floor(barWidth * 0.25)), height);

    ctx.fillStyle = "#dfe6e9";
    ctx.fillRect(x + Math.floor(barWidth * 0.25), 0, Math.max(1, Math.floor(barWidth * 0.1)), height);

    // Rivets / bolts at intersections
    for (const y of horizY) {
      const r = Math.max(3, Math.floor(barWidth * 0.35));
      ctx.beginPath();
      ctx.arc(x + barWidth / 2, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#1e272e";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x + barWidth / 2 - 1, y - 1, Math.max(1, Math.floor(r * 0.4)), 0, Math.PI * 2);
      ctx.fillStyle = "#b2bec3";
      ctx.fill();
    }
  }

  // 5. Dark atmospheric vignette overlay
  const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.75);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  return canvas.toBuffer("image/png");
}

module.exports = {
  createCanvas,
  loadImage,
  safeLoadImage,
  loadAvatarOrFallback,
  createDefaultAvatar,
  registerFont,
  GlobalFonts,
  isCanvasAvailable,
  renderJailEffect
};
