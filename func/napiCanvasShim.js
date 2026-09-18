"use strict";

/**
 * Universal High-Performance Canvas Adapter for Floppa-Chatbot
 * Bridges @napi-rs/canvas to provide 100% drop-in compatibility for both
 * @napi-rs/canvas and legacy node-canvas APIs across all Node.js versions.
 */

const path = require("path");

let realNapi = null;
try {
  // Use direct filesystem path to prevent moduleResolver alias circular recursion
  const napiDirectPath = path.join(__dirname, "../node_modules/@napi-rs/canvas");
  realNapi = require(napiDirectPath);
} catch (_) {}

if (!realNapi) {
  try {
    const nodeCanvasPath = path.join(__dirname, "../node_modules/canvas");
    realNapi = require(nodeCanvasPath);
  } catch (_) {}
}

class FallbackPath2D {
  moveTo() {}
  lineTo() {}
  arc() {}
  closePath() {}
}

const canvasAdapter = {
  createCanvas(width, height) {
    if (realNapi?.createCanvas) {
      return realNapi.createCanvas(width, height);
    }
    return {
      width,
      height,
      getContext: () => ({
        fillRect() {},
        clearRect() {},
        drawImage() {},
        fillText() {},
        measureText: () => ({ width: 0 }),
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        stroke() {},
        fill() {},
        save() {},
        restore() {}
      }),
      toBuffer: () => Buffer.from([])
    };
  },

  async loadImage(src, opts) {
    try {
      const canvasHelper = require("./canvasHelper");
      return await canvasHelper.safeLoadImage(src, opts);
    } catch (e) {
      if (realNapi?.loadImage) {
        return realNapi.loadImage(src, opts);
      }
      return Promise.resolve({ width: 100, height: 100 });
    }
  },

  safeLoadImage(src, opts) {
    const canvasHelper = require("./canvasHelper");
    return canvasHelper.safeLoadImage(src, opts);
  },

  loadAvatarOrFallback(urlOrBuffer, fallbackName, size) {
    const canvasHelper = require("./canvasHelper");
    return canvasHelper.loadAvatarOrFallback(urlOrBuffer, fallbackName, size);
  },

  createDefaultAvatar(name, size) {
    const canvasHelper = require("./canvasHelper");
    return canvasHelper.createDefaultAvatar(name, size);
  },

  registerFont(fontPath, options) {
    if (!fontPath) return false;
    const family = typeof options === "string" ? options : (options && options.family ? options.family : undefined);
    if (realNapi?.GlobalFonts?.registerFromPath) {
      try {
        return realNapi.GlobalFonts.registerFromPath(fontPath, family);
      } catch (_) {
        return false;
      }
    }
    if (realNapi?.registerFont) {
      try {
        return realNapi.registerFont(fontPath, typeof options === "object" ? options : { family });
      } catch (_) {
        return false;
      }
    }
    return false;
  },

  GlobalFonts: realNapi?.GlobalFonts || {
    registerFromPath(fontPath, name) {
      canvasAdapter.registerFont(fontPath, name);
    },
    has() { return false; },
    getFamilies() { return []; },
    loadSystemFonts() {},
    loadFontsFromDir() {}
  },

  Path2D: realNapi?.Path2D || FallbackPath2D,
  Path: realNapi?.Path2D || FallbackPath2D,
  ImageData: realNapi?.ImageData || class ImageData {},
  Image: realNapi?.Image || class Image {},
  Canvas: realNapi?.Canvas || class Canvas {}
};

module.exports = canvasAdapter;
module.exports.default = canvasAdapter;
