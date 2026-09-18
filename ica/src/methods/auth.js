'use strict';

/**
 * @fileoverview tanvir143 - Authentication API
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2026 tanvir143
 * @license MIT
 * @module Auth
 * @since 1.0.1
 */

const EventEmitter = require('events');
const CryptoUtils = require('../utils/crypto');
const ValidationUtils = require('../utils/validation');
const { nkxicaLog: log } = require('../utils/logger');

function extractUserId(user) {
  if (!user || typeof user !== 'object') return null;
  const candidates = [user.pk_id, user.pk, user.user_id, user.id];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = c.toString();
    if (ValidationUtils.isValidUserID(s)) return s;
  }
  return null;
}

class Auth extends EventEmitter {
  constructor(httpClient, options = {}) {
    super();
    this.http = httpClient;
    this.username = options.username;
    this.password = options.password;
    this.deviceId = options.deviceId;
    this.phoneId = options.phoneId;
    this.uuid = options.uuid;
    this.advertisingId = options.advertisingId;
    this.authenticated = false;
    this.userId = null;
  }

  // Login with cookies (Safe and Crash-free)
  async loginWithCookies(cookies, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    try {
      log.info('Logging in with cookies...');

      if (!cookies) {
        throw new Error('Cookies cannot be empty or undefined');
      }

      const CookieUtils = require('../utils/cookies');
      const parsedJar = CookieUtils.parse(cookies);
      
      this.http.jar = parsedJar;
      if (this.http.client && this.http.client.defaults) {
        this.http.client.defaults.jar = parsedJar;
      }
      
      const cookiesList = parsedJar && typeof parsedJar.serializeSync === 'function' 
        ? parsedJar.serializeSync().cookies 
        : [];
      
      const sessionCookie = cookiesList.find(c => c && c.key === 'sessionid');
      const dsUserId = cookiesList.find(c => c && c.key === 'ds_user_id');
      const wdCookie = cookiesList.find(c => c && c.key === 'wd');
      
      if (!sessionCookie) {
        throw new Error('No sessionid cookie found. Cookies may be invalid or expired.');
      }

      if (wdCookie && wdCookie.value) {
        const dimensions = wdCookie.value.split('x');
        this.http.viewportWidth = parseInt(dimensions[0]) || 468;
        this.http.viewportHeight = parseInt(dimensions[1]) || 905;
      }
      
      let userId = options && options.userId ? options.userId : null;
      let username = options && options.username ? options.username : null;

      if (dsUserId && dsUserId.value) {
        userId = dsUserId.value;
      }

      try {
        const rawResponse = await this.http.get('https://www.instagram.com/api/v1/accounts/current_user/');
        const userInfoResponse = rawResponse && rawResponse.data ? rawResponse.data : rawResponse;

        if (userInfoResponse && userInfoResponse.user) {
          const extracted = extractUserId(userInfoResponse.user);
          if (!extracted) {
            throw new Error('Login response contained an invalid user ID');
          }
          this.userId = extracted;
          this.username = userInfoResponse.user.username || username || 'Unknown';
          this.authenticated = true;
          
          if (userInfoResponse.authorization) {
            this.http.setAuthorization(userInfoResponse.authorization);
          }
          
          log.info(`Successfully logged in as ${this.username}`);
          
          const result = {
            success: true,
            userID: this.userId,
            userId: this.userId,
            username: this.username,
            fullName: userInfoResponse.user.full_name || '',
            profilePicUrl: userInfoResponse.user.profile_pic_url || '',
            isVerified: !!userInfoResponse.user.is_verified,
            isPrivate: !!userInfoResponse.user.is_private,
            authorization: this.http.authorization
          };
          
          if (typeof callback === 'function') return callback(null, result);
          return result;
        }
      } catch (verifyError) {
        if (userId) {
          const fallbackId = userId.toString();
          if (ValidationUtils.isValidUserID(fallbackId)) {
            this.userId = fallbackId;
            this.username = username || 'Unknown';
            this.authenticated = true;
            
            log.warn('Could not verify session via network, but fallback ds_user_id is present.');
            
            const result = {
              success: true,
              userID: this.userId,
              userId: this.userId,
              username: this.username,
              fullName: '',
              profilePicUrl: '',
              isVerified: false,
              isPrivate: false,
              authorization: this.http.authorization,
              warning: 'Session verification failed, but fallback cookie ID was loaded'
            };
            
            if (typeof callback === 'function') return callback(null, result);
            return result;
          }
        }
        
        throw new Error(verifyError && verifyError.message ? verifyError.message : 'Failed to verify session with cookies. Cookies may be expired or invalid.');
      }

      throw new Error('Could not verify session with cookies: Invalid user response payload');
    } catch (error) {
      const errorMsg = error && error.message ? error.message : (typeof error === 'string' ? error : 'Unknown error during cookie login');
      log.error('Cookie login failed:', errorMsg);
      
      // Safe Error construction to avoid undefined property access crashes
      const finalError = new Error(errorMsg);
      finalError.error = errorMsg; 
      finalError.success = false;
      
      if (typeof callback === 'function') return callback(finalError);
      throw finalError;
    }
  }

  async login(username, password, callback) {
    if (username) this.username = username;
    if (password) this.password = password;

    if (!this.username || !this.password) {
      const error = new Error('Username and password are required');
      error.error = error.message;
      error.success = false;
      if (typeof callback === 'function') return callback(error);
      throw error;
    }

    try {
      log.info(`Logging in as ${this.username}...`);

      const loginData = {
        phone_id: this.phoneId,
        username: this.username,
        password: this.password,
        guid: this.uuid,
        device_id: this.deviceId,
        adid: this.advertisingId,
        google_tokens: '[]',
        login_attempt_count: 0,
        country_codes: JSON.stringify([{ country_code: '1', source: 'default' }]),
        source: 'login',
        jazoest: CryptoUtils.generateJazoest()
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(loginData));

      const rawResponse = await this.http.post(
        'https://www.instagram.com/api/v1/accounts/login/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      const response = rawResponse && rawResponse.data ? rawResponse.data : rawResponse;

      if (!response) {
        throw new Error('Empty response received from Instagram login endpoint');
      }

      if (response.status === 'ok') {
        const extracted = extractUserId(response.logged_in_user);
        if (!extracted) {
          throw new Error('Login response contained an invalid user ID');
        }
        this.authenticated = true;
        this.userId = extracted;
        this.http.setAuthorization(response.authorization || '');

        log.info(`Successfully logged in as ${response.logged_in_user && response.logged_in_user.username ? response.logged_in_user.username : this.username}`);
        
        const result = {
          success: true,
          userID: this.userId,
          userId: this.userId,
          username: response.logged_in_user && response.logged_in_user.username ? response.logged_in_user.username : this.username,
          fullName: response.logged_in_user && response.logged_in_user.full_name ? response.logged_in_user.full_name : '',
          profilePicUrl: response.logged_in_user && response.logged_in_user.profile_pic_url ? response.logged_in_user.profile_pic_url : '',
          isVerified: response.logged_in_user && !!response.logged_in_user.is_verified,
          isPrivate: response.logged_in_user && !!response.logged_in_user.is_private
        };
        
        if (typeof callback === 'function') return callback(null, result);
        return result;
      }
      
      if (response.two_factor_required) {
        log.info('Two-factor authentication required');
        
        const result = {
          success: false,
          twoFactorRequired: true,
          twoFactorIdentifier: response.two_factor_info && response.two_factor_info.two_factor_identifier ? response.two_factor_info.two_factor_identifier : null,
          phoneNumberHint: response.two_factor_info && response.two_factor_info.obfuscated_phone_number ? response.two_factor_info.obfuscated_phone_number : null
        };
        
        if (typeof callback === 'function') return callback(null, result);
        return result;
      }

      if (response.checkpoint_url) {
        log.warn('Challenge required');
        
        const result = {
          success: false,
          challengeRequired: true,
          checkpointUrl: response.checkpoint_url,
          lock: response.lock
        };
        
        if (typeof callback === 'function') return callback(null, result);
        return result;
      }

      throw new Error(response.message ? response.message : 'Login failed');
    } catch (error) {
      const errorMsg = error && error.message ? error.message : (typeof error === 'string' ? error : 'Unknown error during login');
      log.error('Login failed:', errorMsg);
      
      const finalError = new Error(errorMsg);
      finalError.error = errorMsg;
      finalError.success = false;
      
      if (typeof callback === 'function') return callback(finalError);
      throw finalError;
    }
  }

  async verifyTwoFactor(code, twoFactorIdentifier, callback) {
    try {
      log.info('Verifying 2FA code...');

      const verifyData = {
        verification_code: code,
        phone_id: this.phoneId,
        two_factor_identifier: twoFactorIdentifier,
        username: this.username,
        trust_this_device: 1,
        guid: this.uuid,
        device_id: this.deviceId,
        adid: this.advertisingId,
        google_tokens: '[]',
        login_attempt_count: 0
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(verifyData));

      const rawResponse = await this.http.post(
        'https://www.instagram.com/api/v1/accounts/two_factor_login/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      const response = rawResponse && rawResponse.data ? rawResponse.data : rawResponse;

      if (!response) {
        throw new Error('Empty response received from 2FA endpoint');
      }

      if (response.status === 'ok') {
        const extracted = extractUserId(response.logged_in_user);
        if (!extracted) {
          throw new Error('2FA response contained an invalid user ID');
        }
        this.authenticated = true;
        this.userId = extracted;
        this.http.setAuthorization(response.authorization || '');

        log.info('2FA verification successful');
        
        const result = {
          success: true,
          userID: this.userId,
          userId: this.userId,
          username: response.logged_in_user && response.logged_in_user.username ? response.logged_in_user.username : this.username,
          fullName: response.logged_in_user && response.logged_in_user.full_name ? response.logged_in_user.full_name : ''
        };
        
        if (typeof callback === 'function') return callback(null, result);
        return result;
      }

      throw new Error(response.message ? response.message : 'Two-factor verification failed');
    } catch (error) {
      const errorMsg = error && error.message ? error.message : (typeof error === 'string' ? error : 'Unknown error during 2FA');
      log.error('2FA verification failed:', errorMsg);
      
      const finalError = new Error(errorMsg);
      finalError.error = errorMsg;
      finalError.success = false;
      
      if (typeof callback === 'function') return callback(finalError);
      throw finalError;
    }
  }

  async logout(callback) {
    try {
      const data = {
        guid: this.uuid,
        phone_id: this.phoneId,
        _csrftoken: this.http && typeof this.http.getCsrfToken === 'function' ? (this.http.getCsrfToken() || 'missing') : 'missing'
      };

      const signature = CryptoUtils.generateSignature(JSON.stringify(data));

      await this.http.post(
        'https://www.instagram.com/api/v1/accounts/logout/',
        signature,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      ).catch(() => {});

      log.info('Logged out');
    } catch (error) {
      // Ignore errors
    }

    this.authenticated = false;
    this.userId = null;
    if (this.http && typeof this.http.clearSession === 'function') {
      this.http.clearSession();
    }
    
    const result = { success: true };
    if (typeof callback === 'function') return callback(null, result);
    return result;
  }

  getSession() {
    return {
      username: this.username,
      userId: this.userId,
      authenticated: this.authenticated,
      deviceId: this.deviceId,
      phoneId: this.phoneId,
      uuid: this.uuid,
      advertisingId: this.advertisingId,
      httpSession: this.http && typeof this.http.getSession === 'function' ? this.http.getSession() : null
    };
  }

  async loadSession(sessionData) {
    if (!sessionData) return;
    this.username = sessionData.username;
    this.userId = sessionData.userId ? sessionData.userId.toString() : null;
    this.authenticated = !!sessionData.authenticated;
    this.deviceId = sessionData.deviceId;
    this.phoneId = sessionData.phoneId;
    this.uuid = sessionData.uuid;
    this.advertisingId = sessionData.advertisingId;
    
    if (sessionData.httpSession && this.http && typeof this.http.loadSession === 'function') {
      await this.http.loadSession(sessionData.httpSession);
    }

    log.info('Session loaded');
  }

  isAuthenticated() {
    return this.authenticated && this.userId !== null;
  }

  getCurrentUserID() {
    return {
      userID: this.userId,
      userId: this.userId
    };
  }
}

module.exports = Auth;
