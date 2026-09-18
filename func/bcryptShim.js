"use strict";

const crypto = require("crypto");
const path = require("path");

let realBcrypt = null;
try {
  const directPath = path.join(__dirname, "../node_modules/bcrypt");
  realBcrypt = require(directPath);
} catch (_) {}

function fallbackHash(data, salt) {
  const s = String(salt || "floppa_salt_12345");
  const hash = crypto.createHmac("sha256", s).update(String(data)).digest("hex");
  return `$2b$10$${s}$${hash}`;
}

const bcryptAdapter = {
  genSaltSync(rounds = 10) {
    if (realBcrypt?.genSaltSync) {
      try { return realBcrypt.genSaltSync(rounds); } catch (_) {}
    }
    return crypto.randomBytes(8).toString("hex");
  },

  genSalt(rounds, cb) {
    if (typeof rounds === "function") {
      cb = rounds;
      rounds = 10;
    }
    const salt = this.genSaltSync(rounds);
    if (typeof cb === "function") {
      process.nextTick(() => cb(null, salt));
      return;
    }
    return Promise.resolve(salt);
  },

  hashSync(data, saltOrRounds = 10) {
    if (realBcrypt?.hashSync) {
      try { return realBcrypt.hashSync(data, saltOrRounds); } catch (_) {}
    }
    const salt = typeof saltOrRounds === "string" ? saltOrRounds : this.genSaltSync(saltOrRounds);
    return fallbackHash(data, salt);
  },

  hash(data, saltOrRounds = 10, cb) {
    if (typeof saltOrRounds === "function") {
      cb = saltOrRounds;
      saltOrRounds = 10;
    }
    if (realBcrypt?.hash) {
      try {
        return realBcrypt.hash(data, saltOrRounds, cb);
      } catch (_) {}
    }
    const res = this.hashSync(data, saltOrRounds);
    if (typeof cb === "function") {
      process.nextTick(() => cb(null, res));
      return;
    }
    return Promise.resolve(res);
  },

  compareSync(data, encrypted) {
    if (realBcrypt?.compareSync) {
      try { return realBcrypt.compareSync(data, encrypted); } catch (_) {}
    }
    if (!encrypted || typeof encrypted !== "string") return false;
    if (data === encrypted) return true;
    const parts = encrypted.split("$");
    if (parts.length >= 5) {
      const salt = parts[3];
      const testHash = fallbackHash(data, salt);
      return testHash === encrypted;
    }
    return false;
  },

  compare(data, encrypted, cb) {
    if (realBcrypt?.compare) {
      try {
        return realBcrypt.compare(data, encrypted, cb);
      } catch (_) {}
    }
    const res = this.compareSync(data, encrypted);
    if (typeof cb === "function") {
      process.nextTick(() => cb(null, res));
      return;
    }
    return Promise.resolve(res);
  },

  getRounds(encrypted) {
    if (realBcrypt?.getRounds) {
      try { return realBcrypt.getRounds(encrypted); } catch (_) {}
    }
    return 10;
  }
};

module.exports = bcryptAdapter;
