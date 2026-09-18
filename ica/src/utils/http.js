/**
 * @fileoverview NKXICA - HTTP Client for Instagram API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module HttpClient
 * @since 1.0.0
 */

const EventEmitter = require('events');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { nkxicaLog: log } = require('./logger');
const { TRUSTED_COOKIE_DOMAINS } = require('./constants');
const AdaptiveRateLimiter = require('./rateLimiter');
const CircuitBreaker = require('./circuitBreaker');

// Network error codes that warrant a transient-failure retry with backoff.
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'
]);

class HttpClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.proxy = options.proxy || null;
    this.userAgent = options.userAgent;
    this.deviceId = options.deviceId;
    this.phoneId = options.phoneId;
    this.uuid = options.uuid;
    this.clientSessionId = options.clientSessionId;
    this.authorization = null;
    this.viewportWidth = options.viewportWidth || 468;
    this.viewportHeight = options.viewportHeight || 905;
    // Adaptive rate limiting (learns from 429 responses).
    this.rateLimitController = new AdaptiveRateLimiter({
      globalMinDelayMs: options.globalRateLimitDelay || 1500,
      perUrlBaseDelayMs: options.perUrlBaseDelayMs || 1000
    });
    // Kept for backwards compatibility / inspection.
    this.globalRateLimitDelay = options.globalRateLimitDelay || 1500;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 2000;
    this.rateLimitBackoffMultiplier = 2;
    // Circuit breaker keyed by URL path.
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: options.circuitFailureThreshold || 5,
      cooldownMs: options.circuitCooldownMs || 30000
    });
    this.messageThreadMap = new Map();
    this.messageThreadInsertionOrder = []; // tracks FIFO order for eviction
    this.messageThreadMapMaxSize = 2000; // prevent unbounded growth
    this.seenMessageIDs = new Set();     // deduplication of received messages
    this.seenMessageIDsMaxSize = 5000;
    this.lastSuccessfulResponseAt = 0;

    this.jar = new CookieJar();
    this.setupClient();
  }

  setupClient() {
    const axiosConfig = {
      jar: this.jar,
      timeout: 30000,
      withCredentials: true,  // Required to send cookies
      headers: this.getBaseHeaders()
    };

    if (this.proxy) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(this.proxy);
    }

    this.client = wrapper(axios.create(axiosConfig));
    this.client.defaults.jar = this.jar;
    this.setupInterceptors();
  }

  getBaseHeaders() {
    return {
      'User-Agent': this.userAgent,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'X-IG-App-Locale': 'en_US',
      'X-IG-Device-Locale': 'en_US',
      'X-IG-Mapped-Locale': 'en_US',
      'X-Pigeon-Session-Id': this.clientSessionId,
      'X-IG-Bandwidth-Speed-KBPS': '-1.000',
      'X-IG-Bandwidth-TotalBytes-B': '0',
      'X-IG-Bandwidth-TotalTime-MS': '0',
      'X-Bloks-Version-Id': '5f56efad68e1edec7801f630b5c7887033973f4275dcca1805e0a5a25c7fc5b7',
      'X-IG-Device-ID': this.uuid,
      'X-IG-Family-Device-ID': this.phoneId,
      'X-IG-Android-ID': this.deviceId,
      'X-IG-Timezone-Offset': '0',
      'X-IG-Capabilities': '3brTvx0=',
      'X-IG-App-ID': '936619743392459',
      'X-IG-App-Startup-Country': 'US',
      'X-ASBD-ID': '129477',
      'X-IG-WWW-Claim': '0',
      'X-FB-HTTP-EQ': 'true',
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'sec-ch-ua': '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Priority': 'u=3, i',
      'Accept': '*/*'
    };
  }

  setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        // Adaptive rate limiting: combines global spacing + per-endpoint
        // delay learned from prior 429 responses.
        const wait = this.rateLimitController.recommendDelay(config.url);
        if (wait > 0) {
          log.silly(`Adaptive rate limiting: waiting ${wait}ms for ${config.url}`);
          await this.sleep(wait);
        }
        this.rateLimitController.markRequest(config.url);

        config.headers['X-Pigeon-Rawclienttime'] = Math.floor(Date.now() / 1000).toString();

        if (this.authorization) {
          config.headers['Authorization'] = this.authorization;
        }
        
        // Add CSRF token from cookies if available
        let cookieHeader = '';
        try {
          // Try to get all cookies from jar as string
          const jar = this.jar;
          const allCookies = jar.serializeSync().cookies;
          const relevantCookies = allCookies.filter(c => 
            config.url.includes(c.domain.replace(/^\./, '')) || 
            c.domain === '.instagram.com' ||
            c.domain === '.facebook.com'
          );
          
          if (relevantCookies.length > 0) {
            cookieHeader = relevantCookies.map(c => `${c.key}=${c.value}`).join('; ');
            config.headers['Cookie'] = cookieHeader;
          }
          
          if (process.env.DEBUG_COOKIES) {
            const SENSITIVE_KEYS = new Set(['sessionid', 'csrftoken', 'ds_user_id', 'ig_did', 'mid', 'rur']);
            const maskValue = (key, value) => SENSITIVE_KEYS.has(key) ? `${value.slice(0, 4)}****` : value;
            console.log('[HTTP Debug] All jar cookies:', allCookies.map(c => `${c.key}=${maskValue(c.key, c.value)}`).join(', '));
            console.log('[HTTP Debug] Relevant cookies:', relevantCookies.map(c => c.key).join(', '));
            console.log('[HTTP Debug] Cookie header length:', cookieHeader.length);
          }
        } catch (e) {
          // Fallback to getCookies
          const cookies = await this.jar.getCookies(config.url);
          if (cookies.length > 0) {
            cookieHeader = cookies.map(c => `${c.key}=${c.value}`).join('; ');
            config.headers['Cookie'] = cookieHeader;
          }
        }
        
        // Also try to get individual cookies for headers
        const allCookies = this.jar.serializeSync().cookies;
        const csrfCookie = allCookies.find(c => c.key === 'csrftoken');
        const igDidCookie = allCookies.find(c => c.key === 'ig_did');
        
        if (csrfCookie) {
          config.headers['X-CSRFToken'] = csrfCookie.value;
          config.headers['X-Requested-With'] = 'XMLHttpRequest';
        }
        
        // Add IG-D header for mobile API
        if (igDidCookie) {
          config.headers['IG-D'] = igDidCookie.value;
        }
        
        config.headers['X-IG-Connection-Type'] = 'WIFI';
        config.headers['X-IG-Capabilities'] = '3brTvx0=';
        config.headers['X-ASBD-ID'] = '129477';
        config.headers['Referer'] = 'https://www.instagram.com/';
        config.headers['Origin'] = 'https://www.instagram.com';
        config.headers['Accept'] = '*/*';
        config.headers['Accept-Language'] = 'en-US,en;q=0.9';
        config.headers['Viewport-Width'] = this.viewportWidth.toString();
        config.headers['Viewport-Height'] = this.viewportHeight.toString();
        config.headers['sec-ch-ua'] = '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"';
        config.headers['sec-ch-ua-mobile'] = '?0';
        config.headers['sec-ch-ua-platform'] = '"Windows"';
        config.headers['Sec-Fetch-Site'] = 'same-origin';
        config.headers['Sec-Fetch-Mode'] = 'cors';
        config.headers['Sec-Fetch-Dest'] = 'empty';
        
        log.silly(`${config.method?.toUpperCase()} ${config.url}`);
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        log.silly(`Response ${response.status} from ${response.config.url}`);
        this.lastSuccessfulResponseAt = Date.now();
        // Let the adaptive limiter relax the delay after sustained success.
        this.rateLimitController.recordResponse(response.config.url, response);
        return response;
      },
      async (error) => {
        const originalConfig = error.config || {};
        const url = originalConfig.url;

        // Handle rate limiting (429)
        if (error.response?.status === 429) {
          // Teach the adaptive limiter so future requests space themselves out.
          this.rateLimitController.recordResponse(url, error.response);

          const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
          log.warn(`Rate limited (429), retrying after ${retryAfter}s`);

          originalConfig._retryCount = originalConfig._retryCount || 0;

          if (originalConfig._retryCount < this.maxRetries) {
            originalConfig._retryCount += 1;

            const backoffDelay = this.retryDelay * Math.pow(this.rateLimitBackoffMultiplier, originalConfig._retryCount - 1);
            const totalDelay = Math.max(retryAfter * 1000, backoffDelay);

            log.info(`Retry ${originalConfig._retryCount}/${this.maxRetries} after ${totalDelay}ms`);
            this.emit('rateLimitHit', { url, retryAfter, retryCount: originalConfig._retryCount, totalDelay });
            await this.sleep(totalDelay);

            return this.client.request(originalConfig);
          }

          this.emit('rateLimitExceeded', { url, retryAfter, maxRetries: this.maxRetries });
          log.error(`Max retries (${this.maxRetries}) exceeded for rate limited request`);
        }

        // Handle server errors (5xx) with retry
        if (error.response?.status >= 500 && error.response?.status < 600) {
          originalConfig._retryCount = originalConfig._retryCount || 0;

          if (originalConfig._retryCount < this.maxRetries) {
            originalConfig._retryCount += 1;
            const backoffDelay = this.retryDelay * Math.pow(2, originalConfig._retryCount - 1);

            log.warn(`Server error ${error.response.status}, retry ${originalConfig._retryCount}/${this.maxRetries} after ${backoffDelay}ms`);
            await this.sleep(backoffDelay);

            return this.client.request(originalConfig);
          }
        }

        // Handle transient network errors (no HTTP response) with backoff + jitter.
        if (!error.response && error.code && RETRYABLE_NETWORK_CODES.has(error.code)) {
          originalConfig._retryCount = originalConfig._retryCount || 0;

          if (originalConfig._retryCount < this.maxRetries) {
            originalConfig._retryCount += 1;
            const base = this.retryDelay * Math.pow(2, originalConfig._retryCount - 1);
            const jitter = Math.floor(Math.random() * Math.min(1000, base * 0.2));
            const delay = base + jitter;

            log.warn(`Network error ${error.code}, retry ${originalConfig._retryCount}/${this.maxRetries} after ${delay}ms`);
            this.emit('networkRetry', { url, code: error.code, retryCount: originalConfig._retryCount, delay });
            await this.sleep(delay);

            return this.client.request(originalConfig);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async request(method, url, data = null, options = {}) {
    const circuitKey = this._circuitKeyFor(url);
    try {
      return await this.circuitBreaker.run(circuitKey, async () => {
        const config = { method, url, ...options };
        if (data) config.data = data;
        const response = await this.client.request(config);
        return response.data;
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  _circuitKeyFor(url) {
    if (!url) return '__unknown__';
    try {
      const u = new URL(url);
      return `${u.host}${u.pathname}`;
    } catch (_) {
      const q = url.indexOf('?');
      return q === -1 ? url : url.slice(0, q);
    }
  }

  /**
   * Returns a snapshot of HTTP-layer health for monitoring / debugging.
   */
  getHealth() {
    return {
      lastSuccessfulResponseAt: this.lastSuccessfulResponseAt,
      msSinceLastSuccess: this.lastSuccessfulResponseAt
        ? Date.now() - this.lastSuccessfulResponseAt
        : null,
      circuits: this.circuitBreaker.snapshot(),
      rateLimits: this.rateLimitController.snapshot()
    };
  }

  async post(url, data, options = {}) {
    return this.request('post', url, data, options);
  }

  async postForm(url, form = {}, options = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === 'undefined' || value === null) {
        continue;
      }
      params.append(key, typeof value === 'string' ? value : String(value));
    }

    return this.request('post', url, params.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(options.headers || {})
      }
    });
  }

  async get(url, options = {}) {
    return this.request('get', url, null, options);
  }

  handleError(error) {
    if (error.response) {
      const data = error.response.data;
      // Only log in debug mode to avoid console spam
      if (process.env.DEBUG) {
        console.log('Response status:', error.response.status);
        console.log('Response data:', JSON.stringify(data, null, 2));
      }
      if (data && data.message) {
        return new Error(`Instagram API Error: ${data.message}`);
      }
      return new Error(`HTTP Error ${error.response.status}: ${error.response.statusText}`);
    }
    return error;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setAuthorization(token) {
    if (!token) {
      this.authorization = null;
      return;
    }
    this.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  async setCookieJar(jar) {
    if (!jar || typeof jar.serializeSync !== 'function') return;
    this.jar = jar;
    this.setupClient();
  }

  getSession() {
    return {
      cookies: this.jar.serializeSync(),
      authorization: this.authorization
    };
  }

  async loadSession(sessionData) {
    if (sessionData.cookies) {
      if (typeof sessionData.cookies === 'string') {
        try {
          sessionData.cookies = JSON.parse(sessionData.cookies);
        } catch (_) {
          // Keep raw object if parsing fails
        }
      }
      await this.jar.deserialize(sessionData.cookies);
      if (this.client && this.client.defaults) {
        this.client.defaults.jar = this.jar;
      }
    }
    if (sessionData.authorization) {
      this.authorization = sessionData.authorization;
    }
  }

  clearSession() {
    this.jar = new CookieJar();
    this.authorization = null;
    this.messageThreadMap.clear();
    this.messageThreadInsertionOrder = [];
    this.seenMessageIDs.clear();
    this.rateLimitController.reset();
    this.circuitBreaker.reset();
    this.lastSuccessfulResponseAt = 0;
    this.setupClient();
  }

  getCookieValue(name) {
    const cookies = this.jar.serializeSync().cookies;
    const match = cookies.find((cookie) => cookie.key === name);
    return match ? match.value : undefined;
  }

  getCsrfToken() {
    return this.getCookieValue('csrftoken');
  }

  rememberMessageThread(messageID, threadID) {
    if (!messageID || !threadID) return;
    const key = messageID.toString();
    this.lastThreadID = threadID.toString();
    // Proper FIFO eviction: use insertion-order array to find oldest entry
    if (this.messageThreadMap.size >= this.messageThreadMapMaxSize) {
      const oldestKey = this.messageThreadInsertionOrder.shift();
      if (oldestKey) this.messageThreadMap.delete(oldestKey);
    }
    if (!this.messageThreadMap.has(key)) {
      this.messageThreadInsertionOrder.push(key);
    }
    this.messageThreadMap.set(key, threadID.toString());
  }

  getRememberedThread(messageID) {
    if (!messageID) return this.lastThreadID || undefined;
    return this.messageThreadMap.get(messageID.toString()) || this.lastThreadID || undefined;
  }

  /**
   * Returns true if the messageID has already been seen (deduplication).
   * @param {string} messageID
   */
  isMessageSeen(messageID) {
    if (!messageID) return false;
    return this.seenMessageIDs.has(messageID.toString());
  }

  /**
   * Mark a messageID as seen for deduplication.
   * @param {string} messageID
   */
  markMessageSeen(messageID) {
    if (!messageID) return;
    const key = messageID.toString();
    if (this.seenMessageIDs.size >= this.seenMessageIDsMaxSize) {
      // Delete the oldest entry (Sets preserve insertion order)
      this.seenMessageIDs.delete(this.seenMessageIDs.values().next().value);
    }
    this.seenMessageIDs.add(key);
  }

  /**
   * Set browser session for cookie-based authentication
   * @param {Object} session - Browser session data
   * @param {string} session.userAgent - Browser User-Agent
   * @param {Array} session.cookies - Array of cookie objects
   * @param {string} session.viewport - Viewport dimensions (e.g., "468x905")
   */
  async setBrowserSession(session) {
    if (session.userAgent) {
      this.userAgent = session.userAgent;
      // Update axios config with new User-Agent
      this.client.defaults.headers['User-Agent'] = session.userAgent;
    }
    
    if (session.viewport) {
      const [width, height] = session.viewport.split('x').map(Number);
      this.viewportWidth = width;
      this.viewportHeight = height;
    }
    
    if (session.cookies && Array.isArray(session.cookies)) {
      const { Cookie } = require('tough-cookie');
      
      for (const cookie of session.cookies) {
        try {
          // Validate cookie domain against trusted whitelist to prevent poisoning
          const cookieDomain = (cookie.domain || '').toLowerCase();
          const isTrusted = TRUSTED_COOKIE_DOMAINS.has(cookieDomain) ||
            [...TRUSTED_COOKIE_DOMAINS].some(d => cookieDomain.endsWith(d));
          if (!isTrusted) {
            log.warn(`Skipping cookie from untrusted domain: ${cookieDomain}`);
            continue;
          }

          const toughCookie = new Cookie({
            key: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000) : undefined,
            sameSite: cookie.sameSite || 'Lax'
          });
          
          const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`;
          this.jar.setCookieSync(toughCookie, url);
        } catch (err) {
          // Skip invalid cookies
        }
      }
    }
  }
}

module.exports = HttpClient;