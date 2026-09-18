/**
 * @fileoverview NKXICA - Cookie Parser & Converter Utility
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 NeoKEX
 * @license MIT
 * @module CookieUtils
 * @since 1.0.0
 */

const { CookieJar, Cookie } = require('tough-cookie');

class CookieUtils {
  /**
   * Parse cookies from various formats
   * @param {string|Array|Object} cookieData - Cookie data in various formats
   * @returns {CookieJar} Tough-Cookie jar instance
   */
  static parse(cookieData) {
    const jar = new CookieJar();

    if (!cookieData) {
      return jar;
    }

    // Handle different formats
    if (typeof cookieData === 'string') {
      // Try to detect format
      if (cookieData.includes('# Netscape HTTP Cookie File')) {
        return this.parseNetscape(cookieData, jar);
      } else if (cookieData.startsWith('[') || cookieData.trim().startsWith('[')) {
        return this.parseJSON(cookieData, jar);
      } else {
        // Try JSON parse first, fallback to header format
        try {
          const parsed = JSON.parse(cookieData);
          if (parsed && typeof parsed === 'object') {
            if (parsed.httpSession && parsed.httpSession.cookies) {
              const inner = parsed.httpSession.cookies;
              const list = inner.cookies || (Array.isArray(inner) ? inner : Object.values(inner));
              return this.parseJSON(list, jar);
            }
            if (parsed.cookies) {
              const list = Array.isArray(parsed.cookies) ? parsed.cookies : Object.values(parsed.cookies);
              return this.parseJSON(list, jar);
            }
            if (Array.isArray(parsed)) {
              return this.parseJSON(parsed, jar);
            }
            return this.parseObject(parsed, jar);
          }
        } catch {
          return this.parseHeader(cookieData, jar);
        }
      }
    }

    if (Array.isArray(cookieData)) {
      return this.parseArray(cookieData, jar);
    }

    if (typeof cookieData === 'object' && cookieData !== null) {
      if (cookieData.httpSession && cookieData.httpSession.cookies) {
        const inner = cookieData.httpSession.cookies;
        const list = inner.cookies || (Array.isArray(inner) ? inner : Object.values(inner));
        return this.parseJSON(list, jar);
      }
      if (cookieData.appState) {
        const list = Array.isArray(cookieData.appState) ? cookieData.appState : Object.values(cookieData.appState);
        return this.parseJSON(list, jar);
      }
      if (cookieData.cookies) {
        const list = Array.isArray(cookieData.cookies) ? cookieData.cookies : Object.values(cookieData.cookies);
        return this.parseJSON(list, jar);
      }
      return this.parseObject(cookieData, jar);
    }

    return jar;
  }

  /**
   * Parse Netscape cookies.txt format
   * @param {string} data - Netscape format cookies
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {CookieJar}
   */
  static parseNetscape(data, jar = new CookieJar()) {
    const lines = data.split('\n');

    for (let line of lines) {
      line = line.trim();
      
      // Skip empty lines and pure comments (but not #HttpOnly_ prefix)
      if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
        continue;
      }

      // Handle #HttpOnly_ prefix
      const isHttpOnly = line.startsWith('#HttpOnly_');
      if (isHttpOnly) {
        line = line.substring('#HttpOnly_'.length);
      }

      // Split by tab first, if that fails try multiple spaces
      let parts = line.split('\t');
      if (parts.length < 7) {
        // Try splitting by 2+ spaces (common in copy-pasted cookies)
        parts = line.split(/\s{2,}/);
      }
      // If still not enough parts, try single spaces
      if (parts.length < 7) {
        parts = line.split(/\s+/);
      }
      
      if (parts.length >= 7) {
        const [domain, flag, path, secure, expiration, name, value] = parts;

        try {
          const cookie = new Cookie({
            key: name,
            value: value,
            domain: domain,
            path: path,
            secure: secure === 'TRUE',
            httpOnly: isHttpOnly,
            expires: new Date(parseInt(expiration) * 1000)
          });

          jar.setCookieSync(cookie, `https://${domain.replace(/^\./, '')}`);
        } catch (err) {
          // Skip invalid cookies
        }
      }
    }

    return jar;
  }

  /**
   * Parse JSON array format (Firefox/Chrome export)
   * @param {string|Array} data - JSON array of cookies
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {CookieJar}
   */
  static parseJSON(data, jar = new CookieJar()) {
    try {
      const cookies = typeof data === 'string' ? JSON.parse(data) : data;

      if (!Array.isArray(cookies)) {
        throw new Error('Invalid JSON format: expected array');
      }

      for (const cookie of cookies) {
        try {
          // Only extract essential fields, ignore Firefox-specific ones
          const essentialFields = {
            key: cookie.name || cookie.key,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            sameSite: cookie.sameSite === 'no_restriction' ? 'none' : cookie.sameSite || 'lax'
          };
          
          // Handle expiration
          if (cookie.expirationDate) {
            essentialFields.expires = new Date(cookie.expirationDate * 1000);
          } else if (cookie.expires) {
            essentialFields.expires = new Date(cookie.expires);
          }

          const toughCookie = new Cookie(essentialFields);

          // Build URL for setting cookie
          const domain = cookie.domain.replace(/^\./, '');
          const url = `https://${domain}${cookie.path || '/'}`;
          jar.setCookieSync(toughCookie, url);
        } catch (err) {
          // Skip invalid cookies
        }
      }
    } catch (err) {
      // Return empty jar on parse error
    }

    return jar;
  }

  /**
   * Parse cookie array format
   * @param {Array} cookies - Array of cookie objects
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {CookieJar}
   */
  static parseArray(cookies, jar = new CookieJar()) {
    return this.parseJSON(cookies, jar);
  }

  /**
   * Parse object format (key-value)
   * @param {Object} cookies - Cookie object
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} domain - Default domain
   * @returns {CookieJar}
   */
  static parseObject(cookies, jar = new CookieJar(), domain = '.instagram.com') {
    for (const [name, value] of Object.entries(cookies)) {
      try {
        const cookie = new Cookie({
          key: name,
          value: value,
          domain: domain,
          path: '/'
        });

        jar.setCookieSync(cookie, `https://${domain.replace(/^\./, '')}`);
      } catch (err) {
        // Skip invalid cookies
      }
    }

    return jar;
  }

  /**
   * Parse HTTP Header cookie format
   * @param {string} header - Cookie header string
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {CookieJar}
   */
  static parseHeader(header, jar = new CookieJar()) {
    const cookies = header.split(';').map(c => c.trim()).filter(c => c);

    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.split('=');
      const value = valueParts.join('='); // Handle values with = in them

      if (name && value) {
        try {
          const toughCookie = new Cookie({
            key: name.trim(),
            value: value.trim(),
            domain: '.instagram.com',
            path: '/'
          });

          jar.setCookieSync(toughCookie, 'https://instagram.com');
        } catch (err) {
          // Skip invalid cookies
        }
      }
    }

    return jar;
  }

  /**
   * Parse HTTP Header cookie string.
   * Alias for parseHeader.
   * @param {string} header - Cookie header string
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {CookieJar}
   */
  static parseHeaderString(header, jar = new CookieJar()) {
    return this.parseHeader(header, jar);
  }

  /**
   * Serialize a cookie jar to a JSON string.
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {string}
   */
  static serialize(jar) {
    if (!jar || typeof jar.serializeSync !== 'function') {
      return '';
    }
    try {
      return JSON.stringify(jar.serializeSync());
    } catch (err) {
      return '';
    }
  }

  /**
   * Convert cookie jar to Netscape format
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {string} Netscape format string
   */
  static toNetscape(jar) {
    const cookies = jar.serializeSync().cookies;
    let output = '# Netscape HTTP Cookie File\n';
    output += '# This file was generated by NKXICA. Edit at your own risk.\n\n';

    for (const cookie of cookies) {
      const domain = cookie.domain;
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expiration = cookie.expires ? Math.floor(new Date(cookie.expires).getTime() / 1000) : '0';
      const name = cookie.key;
      const value = cookie.value;

      output += `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}\n`;
    }

    return output;
  }

  /**
   * Convert cookie jar to JSON array format
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {Array} JSON array of cookies
   */
  static toJSON(jar) {
    const cookies = jar.serializeSync().cookies;

    return cookies.map(c => ({
      name: c.key,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      secure: c.secure || false,
      httpOnly: c.httpOnly || false,
      expires: c.expires,
      maxAge: c.maxAge,
      sameSite: c.sameSite
    }));
  }

  /**
   * Convert cookie jar to object format
   * @param {CookieJar} jar - Cookie jar instance
   * @returns {Object} Key-value object of cookies
   */
  static toObject(jar) {
    const cookies = jar.serializeSync().cookies;
    const result = {};

    for (const cookie of cookies) {
      result[cookie.key] = cookie.value;
    }

    return result;
  }

  /**
   * Convert cookie jar to HTTP header string
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} url - URL for cookies
   * @returns {string} Cookie header string
   */
  static toHeader(jar, url = 'https://instagram.com') {
    const cookies = jar.getCookiesSync(url);
    return cookies.map(c => `${c.key}=${c.value}`).join('; ');
  }

  /**
   * Load cookies from file
   * @param {string} filePath - Path to cookie file
   * @returns {CookieJar}
   */
  static loadFromFile(filePath) {
    const fs = require('fs');

    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return this.parse(data);
    } catch (err) {
      return new CookieJar();
    }
  }

  /**
   * Save cookies to file
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} filePath - Path to save cookies
   * @param {string} format - Format to save (netscape, json, header)
   */
  static saveToFile(jar, filePath, format = 'netscape') {
    const fs = require('fs');
    let data;

    switch (format.toLowerCase()) {
      case 'netscape':
      case 'txt':
        data = this.toNetscape(jar);
        break;
      case 'json':
        data = JSON.stringify(this.toJSON(jar), null, 2);
        break;
      case 'header':
        data = this.toHeader(jar);
        break;
      default:
        data = this.toNetscape(jar);
    }

    fs.writeFileSync(filePath, data, 'utf8');
  }

  /**
   * Get specific cookie by name
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} name - Cookie name
   * @param {string} url - URL scope
   * @returns {Cookie|null}
   */
  static getCookie(jar, name, url = 'https://www.instagram.com/') {
    try {
      if (typeof jar?.toJSON === 'function') {
        const cookies = jar.toJSON().cookies || [];
        return cookies.find(c => c.key === name) || null;
      }
      const cookies = jar.getCookiesSync(url);
      return cookies.find(c => c.key === name) || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Set specific cookie
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {Object} options - Cookie options
   * @returns {boolean} Success
   */
  static setCookie(jar, name, value, options = {}) {
    try {
      const cookie = new Cookie({
        key: name,
        value: value,
        domain: options.domain || '.instagram.com',
        path: options.path || '/',
        secure: options.secure || false,
        httpOnly: options.httpOnly || false,
        expires: options.expires,
        maxAge: options.maxAge
      });

      const url = `https://${options.domain || 'www.instagram.com'}${options.path || '/'}`;
      jar.setCookieSync(cookie, url);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Remove specific cookie
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} name - Cookie name
   * @param {string} url - URL scope
   * @returns {boolean} Success
   */
  static removeCookie(jar, name, url = 'https://www.instagram.com/') {
    try {
      const cookies = jar.getCookiesSync(url);
      const cookie = cookies.find(c => c.key === name);
      if (cookie && jar.store && typeof jar.store.removeCookieSync === 'function') {
        jar.store.removeCookieSync(cookie.domain, cookie.path, cookie.key);
      }
      return !!cookie;
    } catch (err) {
      return false;
    }
  }

  /**
   * Check if cookie exists
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} name - Cookie name
   * @param {string} url - URL scope
   * @returns {boolean}
   */
  static hasCookie(jar, name, url = 'https://www.instagram.com/') {
    const cookie = this.getCookie(jar, name, url);
    return cookie !== null;
  }

  /**
   * Get all cookie names
   * @param {CookieJar} jar - Cookie jar instance
   * @param {string} url - URL scope
   * @returns {Array} Array of cookie names
   */
  static getCookieNames(jar, url = 'https://www.instagram.com/') {
    try {
      if (typeof jar?.toJSON === 'function') {
        const cookies = jar.toJSON().cookies || [];
        return cookies.map(c => c.key);
      }
      const cookies = jar.getCookiesSync(url);
      return cookies.map(c => c.key);
    } catch (_) {
      return [];
    }
  }

  /**
   * Clear all cookies
   * @param {CookieJar} jar - Cookie jar instance
   */
  static clearAll(jar) {
    jar.removeAllCookiesSync();
  }
}

module.exports = CookieUtils;