const axios = require('axios');

module.exports = {
  config: {
    name: "translate",
    aliases: ["trans"],
    version: "1.5",
    author: "NTKhang",
    cooldown: 5,
    role: 0,
    description: "Translate text to the desired language",
    usage: "translate <text> -> <iso> or reply to a message",
    category: "utility"
  },

  async onStart({ message, event, args, config, getLang }) {
    const { body = "" } = event;
    let content;
    let langCodeTrans;
    const defaultLang = config.language || 'en';

    if (event.messageReply) {
      content = event.messageReply.body;
      let lastIndexSeparator = body.lastIndexOf("->");
      if (lastIndexSeparator == -1) lastIndexSeparator = body.lastIndexOf("=>");

      if (lastIndexSeparator != -1 && (body.length - lastIndexSeparator == 4 || body.length - lastIndexSeparator == 5))
        langCodeTrans = body.slice(lastIndexSeparator + 2);
      else if ((args[0] || "").match(/\w{2,3}/))
        langCodeTrans = args[0].match(/\w{2,3}/)[0];
      else
        langCodeTrans = defaultLang;
    } else {
      content = args.join(" ");
      let lastIndexSeparator = content.lastIndexOf("->");
      if (lastIndexSeparator == -1) lastIndexSeparator = content.lastIndexOf("=>");

      if (lastIndexSeparator != -1 && (content.length - lastIndexSeparator >= 4)) {
        langCodeTrans = content.slice(lastIndexSeparator + 2).trim();
        content = content.slice(0, lastIndexSeparator).trim();
      } else {
        langCodeTrans = defaultLang;
      }
    }

    if (!content) return message.SyntaxError();

    try {
      const { text, lang } = await translate(content.trim(), langCodeTrans.trim());
      return message.reply(`${text}\n\n🌐 Translated from ${lang} to ${langCodeTrans}`);
    } catch (e) {
      return message.err(e.message);
    }
  }
};

async function translate(text, langCode) {
  const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`);
  return {
    text: res.data[0].map(item => item[0]).join(''),
    lang: res.data[2]
  };
}
