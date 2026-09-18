/**
 * InputClass - Context-Aware Interactive Message Model
 */

const InputRoles = {
  DEV: 4,
  ADMINBOT: 2,
  MODERATORBOT: 1.5,
  VIP: 1.2,
  ADMINBOX: 1,
  EVERYONE: 0
};

class InputClass {
  constructor(ctx) {
    const event = ctx.event || {};
    this.event = event;
    this.api = ctx.api;

    this.body = String(event.body || "");
    this.messageID = event.messageID || null;
    this.senderID = event.senderID || null;
    this.userID = event.senderID || event.userID || null;
    this.threadID = event.threadID || null;
    this.sid = String(this.senderID || "");
    this.tid = String(this.threadID || "");
    this.type = event.type || "message";
    this.isGroup = Boolean(event.isGroup);
    this.participantIDs = event.participantIDs || [];
    this.mentions = event.mentions || {};
    this.attachments = event.attachments || [];
    this.timestamp = event.timestamp || Date.now();
    this.args = Array.isArray(ctx.args) ? [...ctx.args] : (this.body.trim().split(/\s+/).slice(1) || []);
    this.arguments = this.args;
    this.role = ctx.role !== undefined ? ctx.role : 0;
    this.hasMentions = Object.keys(this.mentions).length > 0;
    this.firstMention = this.hasMentions ? { id: Object.keys(this.mentions)[0], name: Object.values(this.mentions)[0] } : null;

    const self = this;
    this.ReplySystem = {
      set(detectID, repObj) {
        if (!detectID || !global.FloppaBot) return;
        global.FloppaBot.onReply.set(String(detectID), {
          ...repObj,
          messageID: detectID,
          author: self.sid,
          commandName: repObj.key || ctx.commandName || ""
        });
      },
      has(detectID) {
        return global.FloppaBot?.onReply?.has(String(detectID)) || false;
      },
      get(detectID) {
        return global.FloppaBot?.onReply?.get(String(detectID));
      },
      delete(detectID) {
        return global.FloppaBot?.onReply?.delete(String(detectID));
      }
    };

    this.ReactSystem = {
      set(detectID, recObj) {
        if (!detectID || !global.FloppaBot) return;
        global.FloppaBot.onReaction.set(String(detectID), {
          ...recObj,
          messageID: detectID,
          author: self.sid,
          commandName: recObj.key || ctx.commandName || ""
        });
      },
      has(detectID) {
        return global.FloppaBot?.onReaction?.has(String(detectID)) || false;
      },
      get(detectID) {
        return global.FloppaBot?.onReaction?.get(String(detectID));
      },
      delete(detectID) {
        return global.FloppaBot?.onReaction?.delete(String(detectID));
      }
    };
  }

  censor(text) {
    return text;
  }
}

module.exports = InputClass;
module.exports.InputClass = InputClass;
module.exports.InputRoles = InputRoles;
