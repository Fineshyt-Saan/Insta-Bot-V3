const axios = require('axios');

module.exports = {
  config: {
    name: 'gpt',
    aliases: ['gpt4', 'askgpt'],
    description: 'Chat with AI powered by GPT-4',
    usage: 'gpt <message>',
    role: 0,
    cooldown: 5,
    category: 'ai'
  },

  async onStart({ api, event, args, message }) {
    const prompt = args.join(' ');
    if (!prompt) return message.reply('Please provide a prompt.');

    try {
      const response = await axios.get(`https://api.jisan-official.com/gpt4?prompt=${encodeURIComponent(prompt)}`);
      const rawAns = response.data?.response || response.data?.answer || (typeof response.data === 'string' ? response.data : null);

function isValidAiResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('<') || trimmed.endsWith('>') || trimmed.startsWith('{') || trimmed.startsWith('<!')) return false;
  if (/<[a-z0-9]+[\s\S]*?>/i.test(trimmed)) return false;
  if (/<!DOCTYPE|<html|<head|<body|<script|fingerprint|simsimi\.net|redirect_link|rdrTimeout|visitorId|cloudflare|just a moment|tr_uuid/i.test(trimmed)) return false;
  if (trimmed.includes('simsimi.net')) return false;
  return true;
}

      if (isValidAiResponse(rawAns)) {
        message.reply(rawAns.trim());
        message.reaction('✅');
        return;
      }
      message.reply('⚠️ Received invalid response from AI service.');
      message.reaction('⚠️');
    } catch (error) {
      console.error('GPT Error:', error.message);
      message.reply('An error occurred while connecting to AI service.');
    }
  }
};
