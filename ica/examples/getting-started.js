'use strict';

/**
 * NKXICA - Getting Started
 *
 * The minimum required cookies are: sessionid, ds_user_id, csrftoken, ig_did
 * Get them from your browser's DevTools → Application → Cookies → instagram.com
 */

const { login } = require('../index');

// ── Cookie login (recommended) ────────────────────────────────────────────────

const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';

login(cookies, { logLevel: 'info' }, (err, api) => {
  if (err) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }

  const me = api.getCurrentUserID();
  console.log('Logged in as uid:', me.userID);

  api.listen((err, event) => {
    if (err) return console.error('Error:', err.message);
    if (event.type !== 'message') return;
    if (event.senderID === me.userID) return;

    console.log(`[${event.isGroup ? 'group' : 'dm'}] ${event.senderID}: ${event.body}`);

    if (event.body && event.body.toLowerCase() === 'ping') {
      api.sendMessage('pong', event.threadID);
    }
  });
});

// ── Password login (alternative) ─────────────────────────────────────────────
//
// login({ username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' }, (err, api) => {
//   if (err && err.twoFactorRequired) {
//     err.verify('YOUR_2FA_CODE').then(() => console.log('2FA verified'));
//     return;
//   }
//   if (err) return console.error('Login failed:', err.message);
//   // use api...
// });