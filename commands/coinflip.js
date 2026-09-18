module.exports = {
  config: { name: 'coinflip', aliases: ['coin', 'flip'], description: 'Flip a coin', usage: 'coinflip', cooldown: 2, role: 0, category: 'game' },
  async run({ api, event, message, logger }) {
    const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
    const tid = event.threadID || event.threadId;
    return message?.reply ? message.reply(result) : api.sendMessage(result, tid, undefined, event.messageID);
  }
};
