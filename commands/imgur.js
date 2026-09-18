/**
 * Imgur Media Uploader Command
 * Uploads images, GIFs, and videos to Imgur with Catbox fallback
 */

const axios = require('axios');
const FormData = require('form-data');

module.exports = {
  config: {
    name: 'imgur',
    aliases: ['imgurdl', 'imguruploader'],
    version: '2.0.0',
    author: '𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍',
    role: 0,
    shortDescription: {
      en: 'Upload media to Imgur'
    },
    longDescription: {
      en: 'Uploads images, animations, or videos to Imgur and returns direct shareable URLs.'
    },
    category: 'media',
    usage: '{p}imgur (reply to image/video/gif)'
  },

  onStart: async function ({ api, event, message }) {
    const threadID = event.threadId || event.threadID;

    let attachments = [];
    if (event.messageReply?.attachments?.length > 0) {
      attachments = event.messageReply.attachments;
    } else if (event.attachments?.length > 0) {
      attachments = event.attachments;
    }

    if (attachments.length === 0) {
      const prompt = '❌ Please reply to an image, video, or GIF to upload to Imgur.';
      return message ? message.reply(prompt) : api.sendMessage(prompt, threadID);
    }

    if (message && typeof message.reaction === 'function') {
      message.reaction('⏳', event.messageID);
    }

    try {
      const links = [];
      for (const attachment of attachments) {
        let uploadedUrl = null;

        // 1. Direct Imgur Client API
        try {
          const imgRes = await axios.get(attachment.url, { responseType: 'arraybuffer', timeout: 15000 });
          const form = new FormData();
          form.append('image', Buffer.from(imgRes.data));

          const res = await axios.post('https://api.imgur.com/3/image', form, {
            headers: {
              ...form.getHeaders(),
              'Authorization': 'Client-ID c769d1073b7d7aa'
            },
            timeout: 15000
          });
          uploadedUrl = res.data?.data?.link;
        } catch (_) {}

        // 2. Fallback: Catbox
        if (!uploadedUrl) {
          try {
            const stream = await global.utils.getStreamFromURL(attachment.url);
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', stream);

            const catRes = await axios.post('https://catbox.moe/user/api.php', form, {
              headers: form.getHeaders(),
              timeout: 15000
            });
            if (typeof catRes.data === 'string' && catRes.data.startsWith('http')) {
              uploadedUrl = catRes.data.trim();
            }
          } catch (_) {}
        }

        if (uploadedUrl) {
          links.push(uploadedUrl);
        }
      }

      if (links.length === 0) {
        throw new Error('All upload attempts failed');
      }

      if (message && typeof message.reaction === 'function') message.reaction('✅', event.messageID);
      const replyMsg = `🌐 𝗨𝗽𝗹𝗼𝗮𝗱𝗲𝗱 𝗟𝗶𝗻𝗸(𝘀):\n\n${links.join('\n')}`;
      return message ? message.reply(replyMsg) : api.sendMessage(replyMsg, threadID);
    } catch (e) {
      if (message && typeof message.reaction === 'function') message.reaction('❌', event.messageID);
      const errMsg = `❌ Failed to upload media: ${e.message}`;
      return message ? message.reply(errMsg) : api.sendMessage(errMsg, threadID);
    }
  },

  run: async function (params) {
    return module.exports.onStart(params);
  }
};
