/**
 * Numero Namespace Utilities
 * A collection of mathematical and numeric operations: variance, clamping, probabilities, currency formatting, abbreviations.
 */

const Numero = {
  applyVariance(value, percent) {
    percent = Math.min(Math.max(percent, 0), 1);
    const randomFactor = (Math.random() * 2 - 1) * percent;
    return value * (1 + randomFactor);
  },

  clamp(min, desired, max) {
    return Math.min(Math.max(desired, min), max);
  },

  chance(probability) {
    probability = Numero.clamp(0, probability, 1);
    return Math.random() < probability;
  },

  largest(...x) {
    if (x.length === 0) throw new Error("No numbers provided");
    return Math.max(...x);
  },

  smallest(...x) {
    if (x.length === 0) throw new Error("No numbers provided");
    return Math.min(...x);
  },

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString("en-US");
  },

  abbreviateNumber(num, digits = 2) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    const n = Math.abs(Number(num));
    const sign = Number(num) < 0 ? "-" : "";

    const lookup = [
      { value: 1e15, symbol: "Q" },
      { value: 1e12, symbol: "T" },
      { value: 1e9, symbol: "B" },
      { value: 1e6, symbol: "M" },
      { value: 1e3, symbol: "K" }
    ];

    const item = lookup.find(item => n >= item.value);
    if (item) {
      return sign + (n / item.value).toFixed(digits).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, "$1") + item.symbol;
    }
    return sign + n.toString();
  },

  formatCompact(num, digits = 2) {
    return Numero.abbreviateNumber(num, digits);
  },

  randomVariance(value, percent) {
    return Numero.applyVariance(value, percent);
  }
};

module.exports = Numero;
