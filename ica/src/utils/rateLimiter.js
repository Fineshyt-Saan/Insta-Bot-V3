'use strict';

/**
 * @fileoverview NKXICA - Adaptive Rate Limiter
 * @author neoaz07 (Saifullah Neoaz)
 * @license MIT
 * @module AdaptiveRateLimiter
 *
 * Tracks per-endpoint minimum delays. Starts at a baseline and learns from
 * server responses:
 *   - HTTP 429 with `Retry-After`: bump the endpoint's delay to that value.
 *   - HTTP 429 without `Retry-After`: multiplicatively increase the delay.
 *   - Many consecutive successes: gradually relax the delay back toward baseline.
 *
 * It also enforces a global minimum spacing between any two requests.
 *
 * The limiter is purely advisory — it just tells you how long to wait. The
 * caller (HttpClient) is responsible for actually awaiting before sending.
 */

class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.globalMinDelayMs = options.globalMinDelayMs || 1500;
    this.perUrlBaseDelayMs = options.perUrlBaseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 60000;
    this.relaxAfterSuccesses = options.relaxAfterSuccesses || 10;
    this.relaxFactor = options.relaxFactor || 0.9;
    this.bumpFactor = options.bumpFactor || 2.0;

    this.lastGlobalRequest = 0;
    this.endpoints = new Map(); // url -> { delayMs, lastRequest, successStreak }
  }

  _key(url) {
    // Group by URL path, ignoring query strings, so per-endpoint learning
    // isn't shattered by per-call query params.
    if (!url) return '__unknown__';
    const q = url.indexOf('?');
    return q === -1 ? url : url.slice(0, q);
  }

  _entry(url) {
    const key = this._key(url);
    let e = this.endpoints.get(key);
    if (!e) {
      e = { delayMs: this.perUrlBaseDelayMs, lastRequest: 0, successStreak: 0 };
      this.endpoints.set(key, e);
    }
    return e;
  }

  /**
   * Returns the delay (in ms) the caller should wait before issuing this
   * request. The caller MUST then call `markRequest(url)` before sending.
   */
  recommendDelay(url) {
    const now = Date.now();
    const e = this._entry(url);

    const sinceGlobal = now - this.lastGlobalRequest;
    const sinceUrl = now - e.lastRequest;

    const globalWait = Math.max(0, this.globalMinDelayMs - sinceGlobal);
    const urlWait = Math.max(0, e.delayMs - sinceUrl);

    return Math.max(globalWait, urlWait);
  }

  /** Mark that a request is being sent now. */
  markRequest(url) {
    const now = Date.now();
    this.lastGlobalRequest = now;
    this._entry(url).lastRequest = now;
  }

  /**
   * Record the server response (or a thrown error) so the limiter can adapt.
   */
  recordResponse(url, response) {
    const e = this._entry(url);
    const status = response && response.status;
    const headers = (response && response.headers) || {};

    if (status === 429) {
      const retryAfterRaw = headers['retry-after'] || headers['Retry-After'];
      const retryAfterSec = parseInt(retryAfterRaw, 10);
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        e.delayMs = Math.min(this.maxDelayMs, retryAfterSec * 1000);
      } else {
        e.delayMs = Math.min(this.maxDelayMs, e.delayMs * this.bumpFactor);
      }
      e.successStreak = 0;
      return;
    }

    if (status >= 200 && status < 300) {
      e.successStreak += 1;
      if (e.successStreak >= this.relaxAfterSuccesses && e.delayMs > this.perUrlBaseDelayMs) {
        e.delayMs = Math.max(this.perUrlBaseDelayMs, e.delayMs * this.relaxFactor);
        e.successStreak = 0;
      }
    }
  }

  snapshot() {
    const out = {};
    for (const [k, v] of this.endpoints) {
      out[k] = { delayMs: v.delayMs, successStreak: v.successStreak };
    }
    return out;
  }

  reset() {
    this.endpoints.clear();
    this.lastGlobalRequest = 0;
  }
}

module.exports = AdaptiveRateLimiter;