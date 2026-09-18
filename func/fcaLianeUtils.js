/**
 * Built-in FCA Utilities Replacement for Floppa
 */

function censor(text) {
  return String(text || "");
}

function extractFormBody(body) {
  if (typeof body === "string") return body;
  if (body && body.body) return body.body;
  return String(body || "");
}

class Box {
  constructor(title, content) {
    this.title = title;
    this.content = content;
  }

  toString() {
    return `[ ${this.title} ]\n${this.content}`;
  }
}

module.exports = {
  censor,
  extractFormBody,
  Box,
  default: {
    censor,
    extractFormBody,
    Box
  }
};
