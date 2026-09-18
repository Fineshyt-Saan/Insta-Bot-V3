/**
 * @fileoverview NKXICA - Cookie Auth & Session Persistence
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Cookie-based login is the recommended authentication method.
 * It avoids password storage and Instagram's login-challenge flow.
 *
 * How to get your cookies:
 *   1. Open Instagram in a browser, log in.
 *   2. Open DevTools -> Application -> Cookies -> instagram.com
 *   3. Export/copy: sessionid, ds_user_id, csrftoken, ig_did
 *   OR use a browser extension like "Cookie-Editor" to export as JSON.
 *
 * Covers:
 *   - Cookie string format
 *   - Cookie JSON array format (browser export)
 *   - Netscape cookies.txt format
 *   - Session persistence (save cookies to disk, restore on restart)
 *   - Cookie utilities
 */

'use strict';

const fs  = require('fs');
const { login } = require('../index');

const SESSION_FILE = './nkxica_session.json';

// ── Format 1: Cookie header string ───────────────────────────────────────────

async function loginWithCookieString() {
  const cookieString = [
    'sessionid=YOUR_SESSION_ID',
    'ds_user_id=YOUR_USER_ID',
    'csrftoken=YOUR_CSRF_TOKEN',
    'ig_did=YOUR_IG_DID'
  ].join('; ');

  const api = await login(cookieString, { logLevel: 'info' });
  console.log('Logged in as uid:', api.getCurrentUserID().userID);
  return api;
}

// ── Format 2: JSON array (browser cookie export) ─────────────────────────────

async function loginWithJsonCookies() {
  const cookies = [
    { name: 'sessionid',  value: 'YOUR_SESSION_ID',  domain: '.instagram.com', path: '/', secure: true,  httpOnly: true  },
    { name: 'ds_user_id', value: 'YOUR_USER_ID',     domain: '.instagram.com', path: '/', secure: false, httpOnly: false },
    { name: 'csrftoken',  value: 'YOUR_CSRF_TOKEN',  domain: '.instagram.com', path: '/', secure: true,  httpOnly: false },
    { name: 'ig_did',     value: 'YOUR_IG_DID',      domain: '.instagram.com', path: '/', secure: true,  httpOnly: true  }
  ];

  const api = await login(cookies, { logLevel: 'info' });
  console.log('Logged in as uid:', api.getCurrentUserID().userID);
  return api;
}

// ── Format 3: Netscape cookies.txt ───────────────────────────────────────────

async function loginWithNetscapeFile() {
  const netscapeText = fs.readFileSync('./cookies.txt', 'utf8');
  const api = await login(netscapeText, { logLevel: 'info' });
  console.log('Logged in as uid:', api.getCurrentUserID().userID);
  return api;
}

// ── Session persistence ───────────────────────────────────────────────────────
// Save the cookie string to disk after login and reload it on the next run.
// This avoids re-entering cookies every time and preserves any tokens
// that Instagram may have refreshed during the session.

async function loginAndSaveSession() {
  const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';
  const api = await login(cookies, { logLevel: 'info' });

  fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies }, null, 2), 'utf8');
  console.log('Session saved to', SESSION_FILE);

  return api;
}

async function loginFromSavedSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log('No saved session found, logging in fresh');
    return loginAndSaveSession();
  }

  const { cookies } = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

  let api;
  try {
    api = await login(cookies, { logLevel: 'info' });
    // Verify the session is still valid
    const inbox = await api.getInbox({ limit: 1 });
    console.log('Session restored. Inbox threads:', inbox.threads.length);
  } catch (err) {
    console.warn('Saved session expired, logging in fresh');
    fs.unlinkSync(SESSION_FILE);
    return loginAndSaveSession();
  }

  return api;
}

// ── Cookie utilities ──────────────────────────────────────────────────────────
// login.CookieUtils is available without any extra import.

function cookieUtilsExamples() {
  const CookieUtils = login.CookieUtils;

  const jar1 = CookieUtils.parse('sessionid=abc; csrftoken=xyz');
  const jar2 = CookieUtils.parseJSON('[{"name":"sessionid","value":"abc","domain":".instagram.com","path":"/"}]');

  CookieUtils.saveToFile(jar1, './cookies_netscape.txt', 'netscape');
  CookieUtils.saveToFile(jar1, './cookies.json', 'json');

  const jar3 = CookieUtils.loadFromFile('./cookies_netscape.txt');
  const all  = jar3.serializeSync().cookies;
  console.log('Cookie names:', all.map(c => c.key).join(', '));
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const api = await loginFromSavedSession();
  const me  = api.getCurrentUserID();
  console.log('Ready. User ID:', me.userID);

  // Cookie utilities are also available on the returned api object:
  // api.CookieUtils.parse(...)
}

main().catch(console.error);