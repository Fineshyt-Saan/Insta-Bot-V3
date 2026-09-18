'use strict';

/**
 * services/index.js
 *
 * Central export hub for domain services.
 */

const { MediaService, mediaService } = require('./media/mediaService');
const { UserService } = require('./users/userService');
const { ThreadService } = require('./threads/threadService');
const { CAPABILITIES, hasCapability, getUnsupportedNotice } = require('./instagram/capabilities');

module.exports = {
  MediaService,
  mediaService,
  UserService,
  ThreadService,
  CAPABILITIES,
  hasCapability,
  getUnsupportedNotice
};
