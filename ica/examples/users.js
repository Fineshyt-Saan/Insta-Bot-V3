/**
 * @fileoverview NKXICA - User Lookup & Search
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 *
 * Covers:
 *   - Get info for a user by numeric ID
 *   - Get info for a user by username
 *   - Search users by keyword
 *   - Search hashtags
 *   - Search places/locations
 *   - Get the currently authenticated user's ID
 */

'use strict';

const { login } = require('../index');

async function main() {
  const cookies = 'sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; csrftoken=YOUR_CSRF_TOKEN; ig_did=YOUR_IG_DID';
  const api = await login(cookies, { logLevel: 'info' });

  // ── Current user ────────────────────────────────────────────────────────────
  const me = api.getCurrentUserID();
  console.log('My user ID:', me.userID);
  console.log('My username:', me.username);

  // ── Get user info by numeric ID ─────────────────────────────────────────────
  const USER_ID = 'NUMERIC_USER_ID';
  const userById = await api.getUserInfo(USER_ID);
  console.log('Username:', userById.username);
  console.log('Full name:', userById.fullName);
  console.log('Followers:', userById.followerCount);
  console.log('Following:', userById.followingCount);
  console.log('Is private:', userById.isPrivate);
  console.log('Is verified:', userById.isVerified);
  console.log('Profile pic:', userById.profilePicUrl);

  // ── Get user info by username ───────────────────────────────────────────────
  const userByName = await api.getUserInfoByUsername('instagram');
  console.log('User ID for @instagram:', userByName.userID);

  // ── Search users ─────────────────────────────────────────────────────────────
  const searchResults = await api.searchUsers('alice', { limit: 5 });
  console.log(`Found ${searchResults.length} users matching "alice":`);
  for (const u of searchResults) {
    console.log(`  @${u.username} (${u.userID}) — ${u.fullName}`);
  }

  // ── Search hashtags ──────────────────────────────────────────────────────────
  const hashtags = await api.searchHashtags('photography', { limit: 5 });
  console.log('Hashtags:', hashtags.map(h => `#${h.name} (${h.mediaCount})`).join(', '));

  // ── Search places/locations ──────────────────────────────────────────────────
  const places = await api.searchPlaces('New York', { limit: 5 });
  console.log('Places:', places.map(p => p.name).join(', '));
}

main().catch(console.error);