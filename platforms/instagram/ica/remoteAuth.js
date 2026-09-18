"use strict";

/**
 * platforms/instagram/ica/remoteAuth.js
 *
 * Connect InstaBOT to private ig-chat-api server.
 * Delegates cleanly to root auth.js for unified RPC and SSE implementation.
 */

const auth = require("../../../auth");

module.exports = auth;
module.exports.login = auth.login || auth;
module.exports.METHODS = auth.METHODS;
module.exports.EventStream = auth.EventStream;
module.exports.pushCookies = auth.pushCookies;
