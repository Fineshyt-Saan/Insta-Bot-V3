/**
 * Command Definers & Unified Creation Helpers
 * Provides defineCommand, easyCMD, and conversion bridges for GoatBot & Cassidy commands.
 */

const { format, autoBold } = require("./styler.js");

function defineCommand(command) {
  // Normalize configuration
  if (command.meta && !command.config) {
    command.config = {
      name: command.meta.name,
      version: command.meta.version || "1.0.0",
      author: command.meta.author || command.meta.credits || "Cassidy/Floppa",
      cooldowns: command.meta.waitingTime || command.meta.cooldown || 5,
      role: command.meta.role !== undefined ? command.meta.role : 0,
      description: command.meta.description || "",
      category: command.meta.category || "Utility",
      guide: {
        en: command.meta.usage || ""
      },
      aliases: command.meta.otherNames || command.meta.aliases || []
    };
  }

  // Normalize entry to onStart if needed
  if (command.entry && !command.onStart) {
    command.onStart = async function ({ api, event, args, message, usersData, threadsData, globalData }) {
      const input = event.input || {
        body: event.body,
        args,
        senderID: event.senderID,
        threadID: event.threadID,
        messageID: event.messageID,
        sid: event.senderID,
        tid: event.threadID
      };
      const output = event.output || {
        reply: (text) => message.reply(text),
        send: (text) => message.reply ? message.reply(text) : message.send(text),
        react: (emoji) => message.reaction ? message.reaction(emoji) : (message.react ? message.react(emoji) : null)
      };

      return command.entry({
        api,
        event,
        args,
        message,
        input,
        output,
        usersDB: usersData,
        threadsDB: threadsData,
        globalDB: globalData,
        usersData,
        threadsData,
        globalData
      });
    };
  }

  return command;
}

function easyCMD(options) {
  const meta = {
    name: options.name,
    category: options.category || "Easy",
    description: options.description || "",
    version: options.version || "1.0.0",
    ...(options.meta || {})
  };

  const command = {
    config: {
      name: meta.name,
      version: meta.version,
      author: meta.author || "Floppa Engine",
      cooldowns: meta.cooldown || 3,
      role: meta.role || 0,
      description: meta.description,
      category: meta.category,
      guide: { en: meta.usage || `{p}${meta.name}` },
      aliases: meta.aliases || []
    },
    meta,
    onStart: async function (ctx) {
      if (typeof options.run === "function") {
        return options.run(ctx);
      }
      return ctx.message.reply("Command executed.");
    },
    entry: options.run
  };

  return command;
}

function defineEntry(entry) {
  return entry;
}

function defineHome(home) {
  return (ctx) => {
    if (home && typeof home.runInContext === "function") {
      return home.runInContext(ctx);
    }
  };
}

function convertToGoat(moduleExport) {
  return defineCommand(moduleExport);
}

global.defineCommand = defineCommand;
global.easyCMD = easyCMD;
global.defineEntry = defineEntry;
global.defineHome = defineHome;

module.exports = {
  defineCommand,
  easyCMD,
  defineEntry,
  defineHome,
  convertToGoat
};
