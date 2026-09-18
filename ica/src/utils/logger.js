'use strict';

/**
 * @fileoverview NKXICA - Logger Utility
 * @author neoaz07 (Saifullah Neoaz)
 * @license MIT
 * @module Logger
 */

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      verbose: 3,
      debug: 4,
      silly: 5,
      trace: 6
    };
  }

  // রেন্ডার বা সেটঅপশন থেকে কল করার জন্য জরুরি এই মেথডটি এখানে যোগ করা হলো
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.level = level;
    }
  }

  _shouldLog(level) {
    const currentLevelWeight = this.levels[this.level] !== undefined ? this.levels[this.level] : 2;
    const targetLevelWeight = this.levels[level] !== undefined ? this.levels[level] : 2;
    return targetLevelWeight <= currentLevelWeight;
  }

  error(...args) {
    if (this._shouldLog('error')) {
      console.error(`[${new Date().toISOString()}] ❌ ERROR`, ...args);
    }
  }

  warn(...args) {
    if (this._shouldLog('warn')) {
      console.warn(`[${new Date().toISOString()}] ⚠️ WARN`, ...args);
    }
  }

  info(...args) {
    if (this._shouldLog('info')) {
      console.log(`[${new Date().toISOString()}] 🔵 INFO`, ...args);
    }
  }

  verbose(...args) {
    if (this._shouldLog('verbose')) {
      console.log(`[${new Date().toISOString()}] 🔍 VERBOSE`, ...args);
    }
  }

  debug(...args) {
    if (this._shouldLog('debug')) {
      console.debug(`[${new Date().toISOString()}] 🐛 DEBUG`, ...args);
    }
  }

  silly(...args) {
    if (this._shouldLog('silly')) {
      console.log(`[${new Date().toISOString()}] 👾 SILLY`, ...args);
    }
  }

  trace(...args) {
    if (this._shouldLog('trace')) {
      console.log(`[${new Date().toISOString()}] 🔍 TRACE`, ...args);
    }
  }
}

const defaultLogger = new Logger();
Logger.nkxicaLog = defaultLogger;
Logger.mqttLog = defaultLogger;
Logger.Logger = Logger;

module.exports = Logger;
