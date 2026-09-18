"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "map",
    aliases: ["maps", "location", "gps"],
    version: "2.0.0",
    author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
    cooldown: 5,
    role: 0,
    category: "tools",
    description: { en: "Get a high resolution satellite or street map of any location" },
    usage: { en: "{p}map <city or location name>" }
  },

  onStart: async function ({ message, args, event, api }) {
    const query = args.join(" ").trim();
    if (!query) {
      return message.reply("🗺️ 𝗠𝗮𝗽 & 𝗚𝗣𝗦 𝗩𝗶𝗲𝘄𝗲𝗿\n\n📌 Usage: {p}map <location name>\n💡 Example: {p}map Tokyo, Japan");
    }

    if (message && typeof message.react === "function") {
      message.react("🗺️").catch(() => {});
    } else if (api && typeof api.setMessageReaction === "function") {
      api.setMessageReaction("🗺️", event.messageID, event.threadID, () => {}, true);
    }

    let tempPath = null;
    try {
      // 1. Geocode location via Nominatim OpenStreetMap
      const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
        headers: { "User-Agent": "InstaBOT/2.0 (Instagram automation)" },
        timeout: 15000
      });

      if (!geoRes.data || geoRes.data.length === 0) {
        throw new Error(`Could not find location "${query}"`);
      }

      const loc = geoRes.data[0];
      const lat = parseFloat(loc.lat);
      const lon = parseFloat(loc.lon);
      const displayName = loc.display_name;

      // 2. Fetch static map image
      const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=14&l=map&size=600,400&pt=${lon},${lat},pm2rdm`;
      const imgRes = await axios.get(mapUrl, { responseType: "arraybuffer", timeout: 20000 });

      const tempDir = path.join(process.cwd(), "temp");
      await fs.ensureDir(tempDir);
      tempPath = path.join(tempDir, `map_${Date.now()}.jpg`);
      await fs.writeFile(tempPath, Buffer.from(imgRes.data));

      if (message && typeof message.react === "function") {
        message.react("✅").catch(() => {});
      } else if (api && typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
      }

      const caption = `🗺️ 𝗠𝗮𝗽 𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻:\n📍 ${displayName.slice(0, 100)}\n🌐 Coordinates: [${lat.toFixed(4)}, ${lon.toFixed(4)}]`;
      const sent = await message.reply({
        body: caption,
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
      return message.reply(`❌ Map error: ${err.message}`);
    }
  }
};
