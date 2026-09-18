module.exports = {
  config: { name: 'dice', aliases: ['roll', 'die'], description: 'Roll a dice', usage: 'dice [sides]', cooldown: 2, role: 0, category: 'game' },
  async run({ api, event, args, message, logger }) {
    const tid = event.threadID || event.threadId;
    const send = (txt) => message?.reply ? message.reply(txt) : api.sendMessage(txt, tid, undefined, event.messageID);
    const sides = parseInt(args[0]) || 6;
    if (sides < 2 || sides > 100) return send('❌ Dice sides must be between 2 and 100.');
    const result = Math.floor(Math.random() * sides) + 1;
    return send(`🎲 Rolling a ${sides}-sided dice...\n\nResult: ${result}`);
  }
};
