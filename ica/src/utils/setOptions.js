/**
 * @fileoverview NKXICA - Options Manager
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 * @module setOptions
 * @since 1.0.0
 */

const defaultOptions = {
  // Listening options
  selfListen: false,           // Listen to own messages
  listenEvents: true,          // Listen for events (read receipts, typing, etc.)
  updatePresence: true,        // Update online presence
  
  // Message options
  autoMarkDelivery: true,      // Auto mark messages as delivered
  autoMarkRead: false,         // Auto mark messages as read
  
  // Database options
  database: false,             // Enable SQLite database
  dbOptions: {
    storage: './nkxica.db',
    logging: false
  },
  
  // Scheduler options
  scheduler: false,          // Enable task scheduler
  schedulerOptions: {},
  
  // Logging options
  logLevel: 'info',           // silly, debug, verbose, info, warn, error, silent
  logColors: true,            // Enable colored logs
  logTimestamps: true,        // Enable timestamps
  
  // Connection options
  proxy: null,                // HTTP proxy URL
  userAgent: null,            // Custom user agent
  timeout: 30000,             // Request timeout
  
  // Security options
  autoReconnect: true,       // Auto reconnect on disconnect
  maxRetries: 3,              // Max retry attempts
  rateLimitDelay: 1000,      // Delay between requests
  
  // Feature flags
  enableTypingIndicator: true,
  enableReadReceipts: true,
  enableReactions: true,
  
  // Session options
  autoSaveSession: true,     // Auto save session to file
  autoListen: true,          // Start MQTT listen automatically after login/session restore
  sessionFile: './session.json',
  mqttConnectionTimeout: 30000,
  
  // Advanced options
  deviceId: null,            // Custom device ID
  phoneId: null,             // Custom phone ID
  uuid: null,                // Custom UUID
  advertisingId: null,       // Custom advertising ID
  
  // Experimental features
  experimental: {
    enableThreads: true,
    enableStories: true,
    enableLive: true,
    enableSearch: true
  }
};

let currentOptions = { ...defaultOptions };

/**
 * Set options for NKXICA
 * @param {Object} options - Options to set
 * @param {boolean} options.selfListen - Listen to own messages
 * @param {boolean} options.listenEvents - Listen for events
 * @param {boolean} options.updatePresence - Update online presence
 * @param {boolean} options.autoMarkDelivery - Auto mark delivered
 * @param {boolean} options.autoMarkRead - Auto mark read
 * @param {boolean} options.database - Enable database
 * @param {boolean} options.scheduler - Enable scheduler
 * @param {string} options.logLevel - Log level
 * @param {string} options.proxy - Proxy URL
 * @param {boolean} options.autoReconnect - Auto reconnect
 * @param {boolean} options.autoSaveSession - Auto save session
 * @returns {Object} Current options
 */
function setOptions(options = {}) {
  currentOptions = {
    ...currentOptions,
    ...options,
    experimental: {
      ...currentOptions.experimental,
      ...(options.experimental || {})
    },
    dbOptions: {
      ...currentOptions.dbOptions,
      ...(options.dbOptions || {})
    }
  };
  
  return currentOptions;
}

/**
 * Get current options
 * @returns {Object} Current options
 */
function getOptions() {
  return { ...currentOptions };
}

/**
 * Reset options to defaults
 * @returns {Object} Default options
 */
function resetOptions() {
  currentOptions = { ...defaultOptions };
  return currentOptions;
}

/**
 * Validate options
 * @param {Object} options - Options to validate
 * @returns {Object} Validation result
 */
function validateOptions(options = {}) {
  const errors = [];
  const warnings = [];
  
  // Validate log level
  const validLogLevels = ['silly', 'debug', 'verbose', 'info', 'warn', 'error', 'silent'];
  if (options.logLevel && !validLogLevels.includes(options.logLevel)) {
    errors.push(`Invalid logLevel: ${options.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
  }
  
  // Validate proxy
  if (options.proxy && !options.proxy.startsWith('http')) {
    warnings.push('Proxy URL should start with http:// or https://');
  }
  
  // Validate timeout
  if (options.timeout !== undefined) {
    if (typeof options.timeout !== 'number' || options.timeout < 5000) {
      errors.push('timeout must be a number >= 5000');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Apply options to client instance
 * @param {InstagramChatAPI} client - Client instance
 * @param {Object} options - Options to apply
 */
function applyOptions(client, options = {}) {
  const opts = { ...currentOptions, ...options };
  
  // Apply logging options
  if (client.logger) {
    client.logger.setLevel(opts.logLevel);
  }
  
  // Apply proxy (recreate http client with new proxy if changed)
  if (opts.proxy && client.http && client.http.proxy !== opts.proxy) {
    client.http.proxy = opts.proxy;
    client.http.setupClient();
  }
  
  // Apply user agent
  if (opts.userAgent && client.http) {
    client.http.userAgent = opts.userAgent;
    client.http.client.defaults.headers['User-Agent'] = opts.userAgent;
  }
  
  return opts;
}

/**
 * Get default options
 * @returns {Object} Default options
 */
function getDefaultOptions() {
  return { ...defaultOptions };
}

module.exports = {
  setOptions,
  getOptions,
  resetOptions,
  validateOptions,
  applyOptions,
  getDefaultOptions,
  defaultOptions
};