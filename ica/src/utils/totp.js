/**
 * @fileoverview NKXICA - TOTP/2FA Utilities
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module TOTPUtils
 * @since 1.0.0
 */

const totp = require('totp-generator');

class TOTPUtils {
  // Generate TOTP code from secret
  static generate(secret, options = {}) {
    try {
      const code = totp(secret, {
        digits: options.digits || 6,
        algorithm: options.algorithm || 'SHA-1',
        period: options.period || 30
      });
      return code;
    } catch (error) {
      throw new Error(`Failed to generate TOTP: ${error.message}`);
    }
  }

  // Verify TOTP code
  static verify(secret, code, options = {}) {
    try {
      // Allow for time drift by checking previous/next window
      const window = options.window || 1;
      
      for (let i = -window; i <= window; i++) {
        const windowCode = totp(secret, {
          digits: options.digits || 6,
          algorithm: options.algorithm || 'SHA-1',
          period: options.period || 30,
          timestamp: Date.now() + (i * 30 * 1000)
        });
        
        if (windowCode === code) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  // Generate new TOTP secret
  static generateSecret(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < length; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  // Generate provisioning URI for QR code
  static generateProvisioningUri(secret, account, issuer = 'Instagram') {
    const encodedAccount = encodeURIComponent(account);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}`;
  }

  // Get time remaining for current TOTP
  static getTimeRemaining(period = 30) {
    const now = Math.floor(Date.now() / 1000);
    return period - (now % period);
  }
}

module.exports = TOTPUtils;