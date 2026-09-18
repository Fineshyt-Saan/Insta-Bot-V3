'use strict';

/**
 * @fileoverview NKXICA - Circuit Breaker
 * @author neoaz07 (Saifullah Neoaz)
 * @license MIT
 * @module CircuitBreaker
 *
 * A minimal circuit breaker. Three states:
 *   - CLOSED: requests flow normally; consecutive failures are counted
 *   - OPEN: requests fail fast for `cooldownMs`
 *   - HALF_OPEN: a single probe request is allowed; success → CLOSED, failure → OPEN
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30000 });
 *   await breaker.run('endpoint-key', () => httpCall());
 */

const STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
});

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownMs = options.cooldownMs || 30000;
    this.halfOpenMaxProbes = options.halfOpenMaxProbes || 1;
    this.isFailure = options.isFailure || ((err) => {
      // Treat 5xx and network errors as circuit failures.
      // 4xx (other than 429) are caller errors and shouldn't trip the breaker.
      if (!err) return false;
      if (err.response && err.response.status >= 500) return true;
      const code = err.code || '';
      return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(code);
    });
    this.circuits = new Map();
  }

  _circuit(key) {
    let c = this.circuits.get(key);
    if (!c) {
      c = {
        state: STATE.CLOSED,
        failures: 0,
        successes: 0,
        openedAt: 0,
        probesInFlight: 0
      };
      this.circuits.set(key, c);
    }
    return c;
  }

  _maybeHalfOpen(c) {
    if (c.state === STATE.OPEN && Date.now() - c.openedAt >= this.cooldownMs) {
      c.state = STATE.HALF_OPEN;
      c.probesInFlight = 0;
    }
  }

  canRequest(key) {
    const c = this._circuit(key);
    this._maybeHalfOpen(c);
    if (c.state === STATE.CLOSED) return true;
    if (c.state === STATE.HALF_OPEN) return c.probesInFlight < this.halfOpenMaxProbes;
    return false;
  }

  recordSuccess(key) {
    const c = this._circuit(key);
    c.failures = 0;
    c.successes += 1;
    if (c.state === STATE.HALF_OPEN) c.probesInFlight = Math.max(0, c.probesInFlight - 1);
    c.state = STATE.CLOSED;
  }

  recordFailure(key, err) {
    const c = this._circuit(key);
    if (!this.isFailure(err)) {
      // Caller-side error: don't count against the breaker.
      if (c.state === STATE.HALF_OPEN) c.probesInFlight = Math.max(0, c.probesInFlight - 1);
      return;
    }
    c.failures += 1;
    c.successes = 0;
    if (c.state === STATE.HALF_OPEN) {
      c.state = STATE.OPEN;
      c.openedAt = Date.now();
      c.probesInFlight = 0;
    } else if (c.failures >= this.failureThreshold) {
      c.state = STATE.OPEN;
      c.openedAt = Date.now();
    }
  }

  async run(key, fn) {
    if (!this.canRequest(key)) {
      const err = new Error(`Circuit breaker is OPEN for ${key}`);
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }
    const c = this._circuit(key);
    if (c.state === STATE.HALF_OPEN) c.probesInFlight += 1;
    try {
      const result = await fn();
      this.recordSuccess(key);
      return result;
    } catch (err) {
      this.recordFailure(key, err);
      throw err;
    }
  }

  state(key) {
    const c = this._circuit(key);
    this._maybeHalfOpen(c);
    return c.state;
  }

  snapshot() {
    const out = {};
    for (const [k, c] of this.circuits) {
      out[k] = { state: c.state, failures: c.failures, successes: c.successes };
    }
    return out;
  }

  reset(key) {
    if (key) this.circuits.delete(key);
    else this.circuits.clear();
  }
}

module.exports = CircuitBreaker;
module.exports.STATE = STATE;