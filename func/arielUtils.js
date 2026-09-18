/**
 * ArielUtils - Economy, Time, and Formatting Utilities
 */

const numMultipliers = {
  "": 1,
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
  qa: 1e15,
  qi: 1e18,
  sx: 1e21,
  sp: 1e24,
  oc: 1e27,
  no: 1e30,
  dc: 1e33,
  ud: 1e36,
  dd: 1e39,
  td: 1e42,
  qad: 1e45,
  qid: 1e48,
  sxd: 1e51,
  spd: 1e54,
  ocd: 1e57,
  nod: 1e60,
  vg: 1e63
};

function parseBet(arg, totalBalance) {
  let targetArg = `${arg || ""}`.trim().toLowerCase();

  if (targetArg === "allin" && !isNaN(totalBalance)) {
    return Math.max(0, Number(totalBalance));
  }

  if (targetArg === "all" && !isNaN(totalBalance)) {
    return Math.max(0, Number(totalBalance));
  }

  if (targetArg.endsWith("%") && !isNaN(totalBalance)) {
    const per = parseFloat(targetArg.replace("%", "")) / 100;
    return Math.max(0, Math.floor(Number(totalBalance) * per));
  }

  const clean = targetArg.replace(/,/g, "").replace(/_/g, "");
  const suffixPattern = Object.keys(numMultipliers)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join("|");

  const regex = new RegExp(`^([\\d.]+(?:e[+-]?\\d+)?)(?:(${suffixPattern}))?$`, "i");
  const match = clean.match(regex);

  if (match) {
    const numberPart = parseFloat(match[1]);
    const abbreviation = (match[2] || "").toLowerCase();

    if (!abbreviation) {
      return Math.floor(numberPart);
    }

    const multiplier = numMultipliers[abbreviation];
    if (multiplier !== undefined) {
      return Math.floor(numberPart * multiplier);
    }
  }

  return NaN;
}

const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "Ud", "Dd", "Td", "Qad", "Qid", "Sxd", "Spd", "Ocd", "Nod", "Vg"];
const fullSuffixes = ["", "Thousand", "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion", "Undecillion", "Duodecillion", "Tredecillion", "Quattuordecillion", "Quindecillion", "Sexdecillion", "Septendecillion", "Octodecillion", "Novemdecillion", "Vigintillion"];

function abbreviateNumber(value, places = 2, isFull = false) {
  let num = Number(value);
  if (isNaN(num)) return "0";
  if (num < 1000 && num > -1000) {
    return num % 1 === 0 ? num.toString() : num.toFixed(places).replace(/\.?0+$/, "");
  }

  const isNeg = num < 0;
  num = Math.abs(num);

  const magnitude = Math.min(Math.floor(Math.log10(num) / 3), suffixes.length - 1);
  const abbreviatedValue = num / Math.pow(1000, magnitude);
  const suffix = isFull ? ` ${fullSuffixes[magnitude]}` : suffixes[magnitude];

  const formatted = places === 0 ? abbreviatedValue.toFixed(0) : abbreviatedValue.toFixed(places).replace(/\.?0+$/, "");
  return `${isNeg ? "-" : ""}${formatted}${suffix}`;
}

function formatCash(number = 0, emoji = "💵", bold = false) {
  if (typeof emoji === "boolean") {
    bold = emoji;
    emoji = "💵";
  }
  const num = Number(number) || 0;
  return `${bold ? "**" : ""}${num > 999 ? `($${abbreviateNumber(num)}) ` : ""}$${num.toLocaleString()}${emoji || "💵"}${bold ? "**" : ""}`;
}

function formatValue(number = 0, emoji = "🎲", bold = false) {
  if (typeof emoji === "boolean") {
    bold = emoji;
    emoji = "🎲";
  }
  const num = Number(number) || 0;
  return `${bold ? "**" : ""}${num > 999 ? `(${emoji || "🎲"}${abbreviateNumber(num)}) ` : ""}${emoji || "🎲"}${num.toLocaleString()}${bold ? "**" : ""}`;
}

function formatTimeSentence(ms, showMs = false) {
  const baseUnits = [
    { label: "year", ms: 365 * 24 * 60 * 60 * 1000 },
    { label: "day", ms: 24 * 60 * 60 * 1000 },
    { label: "hour", ms: 60 * 60 * 1000 },
    { label: "minute", ms: 60 * 1000 },
    { label: "second", ms: 1000 }
  ];

  if (showMs) baseUnits.push({ label: "millisecond", ms: 1 });

  const parts = [];
  let remainingMs = Math.max(0, ms);

  for (const { label, ms: unitMs } of baseUnits) {
    const value = Math.floor(remainingMs / unitMs);
    if (value > 0) {
      parts.push(`${value} ${label}${value > 1 ? "s" : ""}`);
      remainingMs %= unitMs;
    }
  }

  if (parts.length === 0) return "0 seconds";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function makeProgressBar(current, max, length = 15, style = { fill: "█", empty: "░" }) {
  const ratio = Math.min(Math.max(Number(current) / Math.max(Number(max), 1), 0), 1);
  const filledLength = Math.round(length * ratio);
  const emptyLength = Math.max(0, length - filledLength);
  return `${style.fill.repeat(filledLength)}${style.empty.repeat(emptyLength)} [${Math.round(ratio * 100)}%]`;
}

function makeBox(text, title = "") {
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map(l => l.length), (title || "").length + 4, 20);
  const top = title ? `┌─ ${title} ${"─".repeat(Math.max(0, maxLen - title.length - 4))}┐` : `┌${"─".repeat(maxLen + 2)}┐`;
  const bottom = `└${"─".repeat(maxLen + 2)}┘`;
  const middle = lines.map(l => `│ ${l}${" ".repeat(Math.max(0, maxLen - l.length))} │`).join("\n");
  return `${top}\n${middle}\n${bottom}`;
}

function parseCurrency(num) {
  if (num === undefined || num === null) return "0";
  const n = Number(num);
  if (isNaN(n)) return String(num);
  return n.toLocaleString();
}

module.exports = {
  numMultipliers,
  parseBet,
  abbreviateNumber,
  formatCash,
  formatValue,
  formatTimeSentence,
  makeProgressBar,
  makeBox,
  parseCurrency
};
