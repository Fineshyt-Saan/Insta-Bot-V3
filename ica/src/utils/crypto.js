/**
 * @fileoverview NKXICA - Cryptographic Utilities
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module CryptoUtils
 * @since 1.0.0
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class CryptoUtils {
  static generateDeviceId() {
    return `android-${crypto.createHash('md5').update(uuidv4()).digest('hex').substring(0, 16)}`;
  }

  static generateUUID() {
    return uuidv4();
  }

  static generateSignature(data, key = 'b4946d296437556291a8d1611663b81f6b4f7f93a96967b73ddabbe0f9bc62a4') {
    const signedBody = crypto.createHmac('sha256', key).update(data).digest('hex');
    return `ig_sig_key_version=4&signed_body=${signedBody}.${encodeURIComponent(data)}`;
  }

  static generateUserAgent() {
    const androidVersions = ['10', '11', '12', '13', '14'];
    const androidVersion = androidVersions[Math.floor(Math.random() * androidVersions.length)];
    const buildNumber = Math.floor(Math.random() * 100000000);
    const instagramVersion = '350.0.0.0.0';
    
    return `Instagram ${instagramVersion} Android (${androidVersion}/${buildNumber}; 480dpi; 1080x1920; Google; Pixel 4; flame; qcom; en_US; 489720525)`;
  }

  static generateRandomString(length = 10) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }

  static hashMD5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  static hashSHA256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static generateTOTPSecret() {
    return crypto.randomBytes(20).toString('base64');
  }

  static generateJazoest() {
    return Math.floor(Math.random() * 20000).toString();
  }
}

module.exports = CryptoUtils;