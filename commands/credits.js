module.exports = {
  config: {
    name: 'credits',
    aliases: ['author', 'creator'],
    description: 'Show bot credits and author information',
    usage: 'credits',
    cooldown: 5,
    role: 0,
    author: '𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍 (Developer) & lazyneoaz (Original Base)',
    category: 'system'
  },

  async run({ api, event, message, logger, config }) {
    const tid = event.threadID || event.threadId;
    const send = (txt) => message?.reply ? message.reply(txt) : api.sendMessage(txt, tid, undefined, event.messageID);
    try {
      const creditsText =
`InstaBOT v${config.BOT_VERSION}

Developer: frnAlt (https://github.com/frnAlt)
Original Base & Native ICA: lazyneoaz (https://github.com/lazyneoaz/Insta-Bot.git)
Ecosystem: Floppa-Chatbot / GoatBot V2 Architecture
GitHub: https://github.com/frnAlt/InstaBOT

InstaBOT is a powerful, modular Instagram bot built for automation and fun with native ICA integration.

Like this bot? Star it on GitHub!
Found a bug? Open an issue on GitHub.`;

      return send(creditsText);
    } catch (error) {
      logger.error('Error in credits command', { error: error.message });
      return send('Error displaying credits.');
    }
  }
};
