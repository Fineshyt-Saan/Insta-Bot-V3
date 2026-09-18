'use strict';

/**
 * @fileoverview NKXICA - Idempotency / Request Deduplication
 * @author neoaz07 (Saifullah Neoaz)
 * @license MIT
 * @module Idempotency
 *
 * In-memory idempotency cache. Keyed by an arbitrary string (caller-supplied
 * `idempotencyKey` or auto-generated mutation token). The cached value is the
 * resolved result of the first call. Within `ttlMs`, repeat calls with the
 * same key return the cached result instead of re-running the operation.
 *
 * Designed for short-window deduplication of mutation requests (e.g. accidental
 * double-sends from a retry loop). NOT a durable store.
 */

class IdempotencyCache {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes
    this.maxSize = options.maxSize || 1000;
    this.store = new Map(); // key -> { value, expiresAt }
    this.inflight = new Map(); // key -> Promise (collapses concurrent calls)
  }

  _expire() {
    if (this.store.size <= this.maxSize) return;
    const now = Date.now();
    // Drop expired entries first.
    for (const [k, v] of this.store) {
      if (v.expiresAt <= now) this.store.delete(k);
      if (this.store.size <= this.maxSize) return;
    }
    // Still over capacity → drop oldest (insertion order).
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  get(key) {
    if (!key) return undefined;
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (!key) return;
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this._expire();
  }

  /**
   * Run `fn` exactly once per `key` within the TTL.
   * Concurrent calls with the same key share the same in-flight promise.
   */
  async run(key, fn) {
    if (!key) return fn();

    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inflight = this.inflight.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const result = await fn();
        this.set(key, result);
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.store.clear();
    this.inflight.clear();
  }
}

module.exports = IdempotencyCache;