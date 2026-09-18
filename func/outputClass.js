/**
 * OutputClass - Interactive Fluent Response Builder
 */

const { format, autoBold } = require("./styler.js");

class OutputClass {
  constructor(ctx) {
    this.api = ctx.api;
    this.event = ctx.event || {};
    this.message = ctx.message;
    this.threadID = this.event.threadID;
    this.messageID = this.event.messageID;
    this.lastID = null;
  }

  async reply(content, style = null) {
    let body = typeof content === "string" ? content : (content?.body || JSON.stringify(content));
    if (style) {
      body = format({ content: body, ...style });
    } else {
      body = autoBold(body);
    }

    const payload = typeof content === "object" && !Array.isArray(content) ? { ...content, body } : body;

    if (this.message?.reply) {
      const res = await this.message.reply(payload);
      if (res?.messageID) this.lastID = res.messageID;
      return res;
    }

    return new Promise((resolve, reject) => {
      this.api.sendMessage(payload, this.threadID, (err, info) => {
        if (err) return reject(err);
        if (info?.messageID) this.lastID = info.messageID;
        resolve(info);
      }, this.messageID);
    });
  }

  async send(content, threadID = this.threadID) {
    let body = typeof content === "string" ? content : (content?.body || JSON.stringify(content));
    body = autoBold(body);
    const payload = typeof content === "object" && !Array.isArray(content) ? { ...content, body } : body;

    if (threadID === this.threadID) {
      if (this.message?.reply) {
        const res = await this.message.reply(payload);
        if (res?.messageID) this.lastID = res.messageID;
        return res;
      }
      if (this.message?.send) {
        const res = await this.message.send(payload);
        if (res?.messageID) this.lastID = res.messageID;
        return res;
      }
    }

    return new Promise((resolve, reject) => {
      this.api.sendMessage(payload, threadID, (err, info) => {
        if (err) return reject(err);
        if (info?.messageID) this.lastID = info.messageID;
        resolve(info);
      }, threadID === this.threadID ? this.messageID : undefined);
    });
  }

  async react(emoji, messageID = this.messageID) {
    if (this.message?.reaction) {
      return this.message.reaction(emoji, messageID);
    }
    return new Promise((resolve, reject) => {
      this.api.setMessageReaction(emoji, messageID, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      }, true);
    });
  }

  async unsend(messageID = this.lastID || this.messageID) {
    if (!messageID) return;
    if (this.message?.unsend) {
      return this.message.unsend(messageID);
    }
    return new Promise((resolve, reject) => {
      this.api.unsendMessage(messageID, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      });
    });
  }

  async typing(enable = true, threadID = this.threadID) {
    return new Promise((resolve) => {
      if (typeof this.api.sendTypingIndicator === "function") {
        this.api.sendTypingIndicator(enable, threadID, (err) => {
          if (err) return resolve(false);
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }

  wentWrong(msg = "Something went wrong while processing your request.") {
    return this.reply(`❌ | ${msg}`);
  }

  noPermission(role = "Admin") {
    return this.reply(`⚠️ | You do not have permission to use this command. Required role: ${role}`);
  }

  missingArgs(usage = "") {
    return this.reply(`⚠️ | Missing arguments! Usage: ${usage}`);
  }
}

module.exports = OutputClass;
module.exports.OutputClass = OutputClass;
