/**
 * Cache & Temp Storage Manager
 * Manages temporary image/audio downloads, automatically cleaning up expired cache files.
 */

const fs = require("fs-extra");
const path = require("path");

async function clearTempCache(targetDir = null, maxAgeMs = 10 * 60 * 1000) {
  const cachePath = targetDir || path.join(process.cwd(), "cache");
  if (!fs.existsSync(cachePath)) return { cleaned: 0, freedBytes: 0 };

  let cleaned = 0;
  let freedBytes = 0;
  const now = Date.now();

  try {
    const files = await fs.readdir(cachePath);
    for (const file of files) {
      const filePath = path.join(cachePath, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile() && (now - stats.mtimeMs > maxAgeMs)) {
          freedBytes += stats.size;
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (e) {}
    }
  } catch (err) {}

  return { cleaned, freedBytes };
}

module.exports = {
  clearTempCache
};
