/**
 * @fileoverview NKXICA - Instagram Real-time MQTT Client
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module InstagramMQTTClient
 * @since 1.0.0
 * 
 * Instagram MQTT Protocol Implementation
 * - Host: edge-chat.instagram.com:443
 * - Protocol: mqtt-wss (WebSocket Secure)
 * - Compression: Zlib/Deflate
 * - Topics: /ig_realtime_sub, /ig_sub_iris_response
 */

// Relax strict MQTT header flag checks for Instagram custom FB-MQTT proxygen protocol
try {
  const mqttConstants = require('mqtt-packet/constants');
  if (mqttConstants && mqttConstants.requiredHeaderFlags) {
    delete mqttConstants.requiredHeaderFlags[4]; // puback
    delete mqttConstants.requiredHeaderFlags[9]; // suback
  }
} catch (_) {}

const mqtt = require('mqtt');
const EventEmitter = require('events');
const { mqttLog: log } = require('../utils/logger');
const zlib = require('zlib');
const WebSocket = require('ws');
const { PassThrough, Writable } = require('stream');
const Duplexify = require('duplexify');

class InstagramMQTTClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.userId = options.userId;
    this.sessionId = options.sessionId;
    this.csrftoken = options.csrftoken;
    this.igDid = options.igDid;
    this.userAgent = options.userAgent;
    this.cookies = options.cookies || '';
    
    // HTTP client for Iris registration
    this.http = options.http;
    
    // Device fingerprinting - must be consistent
    this.deviceId = options.deviceId || this._generateDeviceId();
    this.phoneId = options.phoneId || this._generateUUID();
    this.uuid = options.uuid || this._generateUUID();
    this.advertisingId = options.advertisingId || this._generateUUID();
    
    this.appId = '124024574287414';
    this.capabilities = '10'; // Capabilities bitmap
    
    this.mqttClient = null;
    this.connected = false;
    this.connectPromise = null;
    this.activeEndpoint = null;
    this.seqId = 0;
    this.snapshotAtMs = Date.now();
    this.irisToken = null;
    this.subscribedTopics = new Set();
    this.manualDisconnect = false;

    // Reconnect backoff strategy (exponential + jitter).
    this.reconnectStrategy = {
      baseDelayMs: options.reconnectBaseDelayMs || 1000,
      maxDelayMs: options.reconnectMaxDelayMs || 30000,
      backoffMultiplier: options.reconnectBackoffMultiplier || 1.5,
      jitterRatio: options.reconnectJitterRatio || 0.2
    };
    this.reconnectAttempts = 0;
  }

  /**
   * Compute the next reconnect delay using exponential backoff + jitter.
   * The attempt counter is reset to 0 by `_onConnected` after a successful
   * handshake, ensuring transient drops don't poison long-running clients.
   */
  _nextReconnectDelay() {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterRatio } = this.reconnectStrategy;
    const exp = baseDelayMs * Math.pow(backoffMultiplier, this.reconnectAttempts);
    const capped = Math.min(maxDelayMs, exp);
    const jitter = (Math.random() * 2 - 1) * jitterRatio * capped; // ±jitterRatio * capped
    this.reconnectAttempts += 1;
    return Math.max(baseDelayMs, Math.floor(capped + jitter));
  }

  _generateDeviceId() {
    return 'android-' + Math.random().toString(36).substring(2, 15);
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async connect() {
    if (this.connected && this.mqttClient) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (!this.userId || !this.sessionId) {
      throw new Error('User ID and session ID required');
    }

    this.manualDisconnect = false;
    this.connectPromise = (async () => {
      try {
        log.info('Registering with Iris...');
        await this._registerIris();
        await this._connectMQTT();
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }
  
  // Iris Registration - Get sync token and sequence ID
  async _registerIris() {
    try {
      if (!this.http) return; // Skip if no HTTP client
      
      // Try to get seq_id from inbox
      const response = await this.http.get('https://www.instagram.com/api/v1/direct_v2/inbox/?limit=1');
      
      if (response && response.seq_id !== undefined) {
        this.seqId = response.seq_id;
        this.snapshotAtMs = response.snapshot_at_ms || Date.now();
        log.info(`Got seq_id from inbox: ${this.seqId}`);
      } else if (response && response.inbox) {
        // Try to extract from inbox structure
        this.seqId = response.inbox.seq_id || 0;
        this.snapshotAtMs = response.inbox.snapshot_at_ms || Date.now();
        log.info(`Got seq_id from inbox structure: ${this.seqId}`);
      }
    } catch (err) {
      log.warn('Iris registration failed, using defaults:', err.message);
      // Continue with defaults (seqId = 0)
    }
  }
  
  async _connectMQTT() {
    const cookieHeader = this._buildCookieHeader();
    const cid = this.uuid || this.deviceId;
    const endpoints = [
      this._buildEndpoint(cid),
      `wss://edge-chat.facebook.com/chat?sid=${this._generateSessionId()}&cid=${encodeURIComponent(cid)}`,
      'wss://edge-chat.instagram.com/chat'
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        await this._connectToEndpoint(endpoint, cookieHeader, cid);
        return;
      } catch (error) {
        lastError = error;
        log.warn(`Connection attempt failed for ${endpoint}: ${error.message}`);
      }
    }

    throw lastError || new Error('MQTT handshake rejected for all known endpoints');
  }

  _generateSessionId() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  }

  _getDefaultUserAgent() {
    return this.userAgent || 'Instagram 350.0.0.0.0 Android (28/8.1.0; 480dpi; 1080x1920; Google; Pixel 2; walleye; qcom; en_US; 143991798)';
  }

  _buildEndpoint(cid) {
    return `wss://edge-chat.instagram.com/chat?sid=${this._generateSessionId()}&cid=${encodeURIComponent(cid)}`;
  }

  _buildCookieHeader() {
    const existing = (this.cookies || '').trim();
    if (existing) {
      return existing;
    }

    const parts = [
      this.sessionId ? `sessionid=${decodeURIComponent(this.sessionId)}` : null,
      this.csrftoken ? `csrftoken=${this.csrftoken}` : null,
      this.igDid ? `ig_did=${this.igDid}` : null,
      this.userId ? `ds_user_id=${this.userId}` : null
    ].filter(Boolean);

    return parts.join('; ');
  }

  _buildWsHeaders(cookieHeader) {
    return {
      'User-Agent': this._getDefaultUserAgent(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.instagram.com',
      'Referer': 'https://www.instagram.com/direct/inbox/',
      'Sec-WebSocket-Version': '13',
      'Sec-Fetch-Dest': 'websocket',
      'Sec-Fetch-Mode': 'websocket',
      'Sec-Fetch-Site': 'same-site',
      'sec-ch-ua': '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-IG-D': this.igDid || '',
      'X-CSRFToken': this.csrftoken || '',
      'Cookie': cookieHeader
    };
  }

  _buildUsernamePayload({ sid, cid }) {
    return JSON.stringify({
      u: this._getDefaultUserAgent(),
      a: 'Instagram',
      mqtt_sid: sid,
      chat_on: true,
      fg: false,
      no_auto_fg: true,
      d: cid,
      ds: '',
      ct: 'cookie_auth',
      aid: 936619743392459,
      cp: 3,
      ecp: 10,
      st: [
        '/ig_message_sync',
        '/ig_realtime_sub',
        '/ig_send_message_response',
        '/ig_sub_iris_response',
        '/pubsub',
        '/pp',
        '/t_region_hint'
      ],
      pm: [],
      dc: '',
      php_override: '',
      app_specific_info: {
        platform: 'android',
        app_version: '350.0.0.0.0',
        capabilities: '3brTvx0=',
        'User-Agent': this._getDefaultUserAgent(),
        'Accept-Language': 'en-US',
        ig_mqtt_route: 'django',
        auth_cache_enabled: '0',
        pubsub_msg_type_blacklist: '{"direct":"typing_type"}'
      }
    });
  }

  _createWebsocketFactory() {
    return (url, websocketSubProtocols, options) => {
      const dynamicHeaders = options && options.wsOptions && options.wsOptions.headers
        ? options.wsOptions.headers
        : {};
      const wsOpts = {
        ...(options && options.wsOptions ? options.wsOptions : {}),
        headers: dynamicHeaders,
        perMessageDeflate: true,
        protocolVersion: 13
      };

      const ws = new WebSocket(url, websocketSubProtocols, wsOpts);
      ws.on('unexpected-response', (_req, res) => {
        log.warn(`WS unexpected response: ${res && res.statusCode ? res.statusCode : 'unknown'}`);
      });
      ws.on('close', (code, reason) => {
        const closeReason = reason ? reason.toString() : '';
        log.warn(`WS close code=${code}${closeReason ? ` reason=${closeReason}` : ''}`);
      });
      return ws;
    };
  }

  _buildProxy() {
    let target = null;
    let ended = false;

    const proxy = new Writable({
      autoDestroy: true,
      write(chunk, _enc, cb) {
        if (ended || this.destroyed) return cb();
        const ws = target;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), cb);
          } catch (error) {
            cb(error);
          }
        } else {
          cb();
        }
      },
      writev(chunks, cb) {
        if (ended || this.destroyed) return cb();
        const ws = target;
        if (!ws || ws.readyState !== WebSocket.OPEN) return cb();
        try {
          for (const { chunk } of chunks) {
            ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          cb();
        } catch (error) {
          cb(error);
        }
      },
      final(cb) {
        ended = true;
        const ws = target;
        target = null;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          try {
            ws.terminate();
          } catch (_) {
            // Ignore termination errors during shutdown.
          }
        }
        cb();
      }
    });

    proxy.setTarget = (ws) => {
      if (!ended) {
        target = ws;
      }
    };
    proxy.hardEnd = () => {
      ended = true;
      target = null;
    };

    return proxy;
  }

  _buildStream(url, mqttOptions) {
    const ws = new WebSocket(url, mqttOptions.wsOptions);
    const proxy = this._buildProxy();
    const readable = new PassThrough();
    const stream = Duplexify(undefined, undefined, { end: false, autoDestroy: true });
    const noopWritable = new Writable({ write(_chunk, _enc, cb) { cb(); } });

    let pingTimer = null;
    let livenessTimer = null;
    let lastActivity = Date.now();
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pingTimer);
      clearInterval(livenessTimer);
      pingTimer = null;
      livenessTimer = null;
      proxy.hardEnd();
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
      try {
        readable.end();
      } catch (_) {}
    };

    ws.on('open', () => {
      proxy.setTarget(ws);
      stream.setWritable(proxy);
      stream.setReadable(readable);
      stream.emit('connect');
      lastActivity = Date.now();

      clearInterval(pingTimer);
      clearInterval(livenessTimer);

      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch (_) {}
        }
      }, 30000);

      livenessTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastActivity > 65000) {
          try {
            ws.terminate();
          } catch (_) {}
        }
      }, 10000);
    });

    ws.on('message', (data) => {
      lastActivity = Date.now();
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      readable.write(buffer);
    });

    ws.on('pong', () => {
      lastActivity = Date.now();
    });

    ws.on('unexpected-response', (_req, res) => {
      log.warn(`WS unexpected response: ${res && res.statusCode ? res.statusCode : 'unknown'}`);
    });

    ws.on('error', (error) => {
      cleanup();
      stream.destroy(error);
    });

    ws.on('close', (code, reason) => {
      const closeReason = reason ? reason.toString() : '';
      log.warn(`WS close code=${code}${closeReason ? ` reason=${closeReason}` : ''}`);
      cleanup();
      stream.end();
      if (!stream.destroyed) {
        stream.destroy();
      }
    });

    stream.on('prefinish', () => {
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
    });
    stream.on('finish', cleanup);
    stream.on('close', cleanup);
    proxy.on('close', () => {
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
    });

    return stream;
  }

  _createMqttClient(endpoint, mqttOptions) {
    return new mqtt.Client(() => {
      const url = endpoint.includes('sid=')
        ? this._buildEndpoint(this.uuid || this.deviceId)
        : endpoint;

      const refreshedCookieHeader = this._buildCookieHeader();
      mqttOptions.username = this._buildUsernamePayload({
        sid: this._generateSessionId(),
        cid: this.uuid || this.deviceId
      });
      mqttOptions.password = refreshedCookieHeader;
      mqttOptions.wsOptions = {
        headers: this._buildWsHeaders(refreshedCookieHeader),
        perMessageDeflate: true,
        protocolVersion: 13
      };

      return this._buildStream(url, mqttOptions);
    }, mqttOptions);
  }

  _buildMqttOptions(endpoint, cookieHeader, cid) {
    const sid = this._generateSessionId();
    const headers = this._buildWsHeaders(cookieHeader);

    return {
      clientId: `mqttwsclient_${Math.random().toString(36).slice(2, 10)}`,
      username: this._buildUsernamePayload({ sid, cid }),
      password: cookieHeader,
      protocol: 'wss',
      protocolId: 'MQIsdp',
      protocolVersion: 3,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      connectTimeout: 15000,
      resubscribe: false,
      queueQoSZero: true,
      reconnectOnConnackError: true,
      wsOptions: { headers },
      rejectUnauthorized: false,
      incomingStore: undefined,
      outgoingStore: undefined
    };
  }

  _connectToEndpoint(endpoint, cookieHeader, cid) {
    return new Promise((resolve, reject) => {
      const mqttOptions = this._buildMqttOptions(endpoint, cookieHeader, cid);
      const client = this._createMqttClient(endpoint, mqttOptions);

      let settled = false;
      let connected = false;

      const cleanup = () => {
        clearTimeout(failTimer);
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
        client.removeListener('close', onClose);
        client.removeListener('offline', onOffline);
      };

      const fail = (error) => {
        if (settled || connected) return;
        settled = true;
        cleanup();
        try {
          client.end(true);
        } catch (_) {
          // Ignore shutdown errors for failed probes.
        }
        reject(error);
      };

      const onConnect = (connack) => {
        if (settled) return;
        if (connack && typeof connack.returnCode === 'number' && connack.returnCode !== 0) {
          fail(new Error(`MQTT connack rejected with return code ${connack.returnCode}`));
          return;
        }

        settled = true;
        connected = true;
        cleanup();

        this.mqttClient = client;
        this.connected = true;
        this.activeEndpoint = endpoint;
        // Reset backoff after a successful handshake so future drops don't
        // accumulate exponentially.
        this.reconnectAttempts = 0;

        // After the first successful handshake we let MQTT.js keep the
        // websocket alive and reconnect on transient drops, with the delay
        // chosen by our exponential-backoff + jitter strategy.
        this.mqttClient.options.reconnectPeriod = this._nextReconnectDelay();

        this._bindPersistentClientHandlers(client, endpoint, cid);
        this._onConnected(endpoint, 'cookie-auth');
        resolve();
      };

      const onError = (error) => fail(error);
      const onClose = () => fail(new Error('Socket closed before MQTT connect completed'));
      const onOffline = () => fail(new Error('Socket went offline before MQTT connect completed'));

      const failTimer = setTimeout(() => {
        fail(new Error('MQTT connect timeout'));
      }, 16000);

      log.info(`Connecting to ${endpoint} [cookie-auth]...`);
      client.once('connect', onConnect);
      client.once('error', onError);
      client.once('close', onClose);
      client.once('offline', onOffline);
    });
  }

  _bindPersistentClientHandlers(client, endpoint, cid) {
    client.on('connect', () => {
      this.connected = true;
      this.activeEndpoint = endpoint;
      this._onConnected(endpoint, 'cookie-auth');
    });

    client.on('message', (topic, message) => {
      this._handleMessage(topic, message);
    });

    client.on('error', (err) => {
      log.error('Error:', err.message);
      this.emit('error', err);
    });

    client.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.subscribedTopics.clear();
      log.warn('Connection closed');
      if (wasConnected) {
        this.emit('disconnected');
      }
    });

    client.on('reconnect', () => {
      client.options.username = this._buildUsernamePayload({
        sid: this._generateSessionId(),
        cid
      });
      client.options.password = this._buildCookieHeader();
      client.options.wsOptions = {
        headers: this._buildWsHeaders(client.options.password)
      };
      // Pick the next backoff window for the *following* reconnect attempt.
      const nextDelay = this._nextReconnectDelay();
      client.options.reconnectPeriod = nextDelay;
      log.info(`Reconnecting... next attempt in ${nextDelay}ms (attempt ${this.reconnectAttempts})`);
      this.emit('reconnecting', { attempt: this.reconnectAttempts, delay: nextDelay });
    });

    client.on('offline', () => {
      log.warn('Client went offline');
    });
  }

  _onConnected(endpoint, profile) {
    log.info(`Connected to Instagram MQTT via ${endpoint} [${profile}]`);
    this._subscribeToTopics();
    this._requestIrisSync();
    this.emit('connected', { method: 'mqtt', endpoint, profile });
  }

  _subscribeToTopics() {
    const topics = [
      '/ig_realtime_sub',
      '/ig_sub_iris_response',
      '/ig_message_sync',
      '/ig_send_message_response',
      '/pubsub',
      '/t_region_hint',
      '/pp'
    ];

    // Only add user-scoped topics if userId is known
    if (this.userId) {
      topics.push(
        `/ig_realtime_sub/${this.userId}`,
        `/ig_sub_iris_response/${this.userId}`,
        `/ig_message_sync/${this.userId}`
      );
    }

    topics.forEach(topic => {
      if (this.subscribedTopics.has(topic)) {
        return;
      }

      this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          log.error(`Failed to subscribe to ${topic}:`, err.message);
        } else {
          this.subscribedTopics.add(topic);
          log.silly(`Subscribed to ${topic}`);
        }
      });
    });
  }

  sendReaction(threadID, itemID, emoji, reactionStatus = 'created') {
    if (!this.mqttClient || !this.connected) {
      throw new Error('MQTT not connected');
    }

    const clientContext = this._generateUUID();
    const payload = JSON.stringify({
      action:               'send_item',
      send_attribution:     'direct_thread',
      thread_id:            threadID,
      item_id:              itemID,
      item_type:            'reaction',
      emoji:                emoji,
      reaction_status:      reactionStatus,
      node_type:            'item',
      client_context:       clientContext,
      mutation_token:       clientContext,
      offline_threading_id: clientContext,
    });

    log.silly(`[REACTION] MQTT publish payload: ${payload}`);
    return new Promise((resolve, reject) => {
      this.mqttClient.publish('/ig_send_message', payload, { qos: 1 }, (err) => {
        if (err) {
          log.warn(`[REACTION] MQTT publish error: ${err.message}`);
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }

  _requestIrisSync() {
    if (!this.mqttClient || !this.connected) {
      return;
    }

    const syncPayload = JSON.stringify({
      user_id: this.userId,
      seq_id: this.seqId,
      snapshot_at_ms: Date.now(),
      request_type: 'initial_sync'
    });

    this.mqttClient.publish('/ig_sub_iris', syncPayload, { qos: 1 }, (err) => {
      if (err) {
        log.warn(`Failed to request Iris sync: ${err.message}`);
      }
    });
  }

  _handleMessage(topic, message) {
    try {
      let data;
      log.silly(`message on ${topic} len=${message ? message.length : 0}`);

      if (Buffer.isBuffer(message)) {
        // Try zlib inflate first, then raw deflate, then plain JSON
        let parsed = false;
        for (const tryFn of [
          () => JSON.parse(zlib.inflateSync(message).toString()),
          () => JSON.parse(zlib.inflateRawSync(message).toString()),
          () => JSON.parse(message.toString())
        ]) {
          try { data = tryFn(); parsed = true; break; } catch (_) {}
        }
        if (!parsed) {
          log.silly(`Could not parse binary message on ${topic}`);
          return;
        }
      } else {
        try {
          data = JSON.parse(message.toString());
        } catch (_) {
          return;
        }
      }

      log.silly(`parsed data on ${topic}`);

      // Top-level may be an array of patch objects or a single object
      const packets = Array.isArray(data) ? data : [data];

      for (const packet of packets) {
        if (packet.seq_id) {
          this.seqId = Math.max(this.seqId, parseInt(packet.seq_id, 10) || 0);
        }

        this._handlePacket(packet, topic);
      }
    } catch (error) {
      log.silly('Failed to handle message:', error.message);
    }
  }

  _handlePacket(packet, topic) {
    // Instagram patch events with nested JSON value strings
    if (packet.event === 'patch' && Array.isArray(packet.data)) {
      for (const patch of packet.data) {
        if (process.env.DEBUG_MQTT) {
          const valPreview = typeof patch.value === 'string'
            ? patch.value.slice(0, 500)
            : JSON.stringify(patch.value)?.slice(0, 500);
          log.silly(`patch op=${patch.op} path=${patch.path} val=${valPreview}`);
        }

        // Only process thread item paths (ignore thread-level metadata patches)
        if (patch.path && !patch.path.includes('/items/')) continue;

        // op=remove on an /items/ path means a message was unsent
        if (patch.op === 'remove') {
          let threadID = null;
          let messageID = null;
          if (patch.path) {
            const m = patch.path.match(/\/threads\/([^/]+)\/items\/([^/]+)/);
            if (m) {
              threadID = m[1];
              messageID = m[2];
            }
          }
          const unsent = { type: 'message_unsent', threadID, messageID };
          this.emit('event', unsent);
          this.emit('message_unsent', unsent);
          continue;
        }

        // Accept add, replace, and upsert — Instagram uses all three for
        // incoming messages (new messages arrive as "add", replied messages
        // and edits arrive as "replace").
        const isWriteOp = (patch.op === 'add' || patch.op === 'replace' || patch.op === 'upsert');
        if (!isWriteOp || !patch.value) continue;

        let item;
        try {
          item = typeof patch.value === 'string' ? JSON.parse(patch.value) : patch.value;
        } catch (_) {
          continue;
        }

        if (process.env.DEBUG_MQTT) {
          log.silly(`patch op=${patch.op} path=${patch.path} item_type=${item.item_type} text=${item.text?.slice(0,40)} replied_to_item=${JSON.stringify(item.replied_to_item?.item_id)}`);
        }

        // Extract thread ID from path: /direct_v2/threads/<threadID>/items/<itemID>
        let threadID = item.thread_id || item.thread_v2_id;
        if (!threadID && patch.path) {
          const m = patch.path.match(/\/threads\/([^/]+)\//);
          if (m) threadID = m[1];
        }

        const event = this._parseItem(item, threadID, topic);
        if (event) {
          this.emit('event', event);
          if (event.type) this.emit(event.type, event);
        }
      }
      return;
    }

    // Pubsub typing events
    if (topic === '/pubsub' || topic.startsWith('/pubsub/')) {
      if (packet.data && Array.isArray(packet.data)) {
        for (const entry of packet.data) {
          let payload;
          try {
            payload = typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
          } catch (_) { continue; }
          if (payload && (payload.is_typing !== undefined || payload.activity_status !== undefined)) {
            const event = {
              type: 'typ',
              from: payload.sender_id?.toString() || payload.user_id?.toString(),
              threadID: payload.thread_id?.toString(),
              isTyping: !!(payload.is_typing || payload.activity_status === '1')
            };
            this.emit('event', event);
            this.emit('typ', event);
          }
        }
      }
      return;
    }

    // Send-message response: confirms MQTT-published items (reactions, messages)
    if (topic === '/ig_send_message_response') {
      log.silly(`send_message_response: ${JSON.stringify(packet).slice(0, 200)}`);
      if (packet.error_type) {
        log.warn(`MQTT send error: ${packet.error_type} — ${packet.message || ''}`);
      }
      return;
    }

    // Direct item_type at top level (older format)
    if (packet.item_type || packet.text !== undefined) {
      const event = this._parseItem(packet, packet.thread_id || packet.thread_v2_id, topic);
      if (event) {
        this.emit('event', event);
        if (event.type) this.emit(event.type, event);
      }
    }
  }

  // Extract the replied-to message ID from an item.
  // Instagram's MQTT Iris protocol uses "replied_to_message" (confirmed from
  // live packet capture). All other field-name variants are kept as fallbacks
  // in case the API changes or a different client version is in use.
  _extractReplyTo(item) {
    // Primary field confirmed from live MQTT packets
    if (item.replied_to_message) {
      const id = (item.replied_to_message.item_id || item.replied_to_message.id)?.toString();
      if (id) return id;
    }

    // Legacy / alternative field names
    if (item.replied_to_item) {
      const id = (item.replied_to_item.item_id || item.replied_to_item.id)?.toString();
      if (id) return id;
    }

    return (
      item.replied_to_item_id?.toString()
      || item.replied_to_target_id?.toString()
      || item.reply_to_target_id?.toString()
      || item.reply_target_id?.toString()
      || item.reply_to_item?.item_id?.toString()
      || item.reply_to_item?.id?.toString()
      || item.reply_to_item_id?.toString()
      || item.reply_to_message?.item_id?.toString()
      || item.reply_to_message?.id?.toString()
      || item.reply_to_message_id?.toString()
      || item.quoted_item?.item_id?.toString()
      || item.quoted_item?.id?.toString()
      || item.in_reply_to_id?.toString()
      || item.parent_item_id?.toString()
      || item.thread_reply_id?.toString()
      || null
    );
  }

  _parseItem(item, threadID, topic) {
    const res = this._doParseItem(item, threadID, topic);
    if (res && res.messageID && (res.type === 'message' || res.attachments?.length > 0)) {
      if (!this._recentMessages) this._recentMessages = new Map();
      this._recentMessages.set(res.messageID, res);
      if (typeof global !== "undefined") {
        if (!global.recentMessages) global.recentMessages = new Map();
        global.recentMessages.set(String(res.messageID), res);
      }
      if (this._recentMessages.size > 500) {
        const first = this._recentMessages.keys().next().value;
        this._recentMessages.delete(first);
      }
    }
    return res;
  }

  _doParseItem(item, threadID, topic) {
    if (!item) return null;

    const tid     = (threadID || item.thread_id || item.thread_v2_id)?.toString();
    const sid     = (item.user_id || item.sender_id)?.toString();
    const mid     = (item.item_id || item.message_id)?.toString();
    const ts      = (item.timestamp || Date.now()).toString();
    const isGroup = tid ? (item.is_group === true || tid.includes(':')) : false;

    const replyTo = this._extractReplyTo(item);
    const repliedObj = item.replied_to_message || item.replied_to_item || item.reply_to_message || item.reply_to_item || item.quoted_item;
    let repliedMessage = null;
    if (repliedObj && typeof repliedObj === "object") {
      const rMedia = repliedObj.media || repliedObj.visual_media?.media || repliedObj.raven_media?.media || repliedObj.clip?.clip || repliedObj.media_share || repliedObj;
      const rAttach = [];
      if (rMedia) {
        const u = rMedia.image_versions2?.candidates?.[0]?.url
          || rMedia.candidates?.[0]?.url
          || rMedia.carousel_share?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
          || rMedia.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
          || rMedia.video_versions?.[0]?.url
          || rMedia.audio?.audio_src
          || rMedia.voice_media?.media?.audio?.audio_clusters?.[0]?.url
          || rMedia.animated_media?.images?.fixed_height?.url
          || rMedia.url;
        if (u) {
          const type = (rMedia.media_type === 2 || rMedia.video_versions) ? "video"
            : (rMedia.audio || rMedia.voice_media) ? "audio"
            : (rMedia.animated_media) ? "animated_image"
            : "photo";
          rAttach.push({ type, url: u });
        }
      }
      if (rAttach.length === 0 && replyTo) {
        const cached = (this._recentMessages && this._recentMessages.get(replyTo)) ||
                       (typeof global !== "undefined" && global.recentMessages && global.recentMessages.get(String(replyTo)));
        if (cached && Array.isArray(cached.attachments) && cached.attachments.length > 0) {
          for (const ca of cached.attachments) rAttach.push(ca);
        }
      }
      repliedMessage = {
        messageID: (repliedObj.item_id || repliedObj.id || replyTo)?.toString(),
        senderID: (repliedObj.user_id || repliedObj.sender_id)?.toString(),
        body: repliedObj.text || repliedObj.caption?.text || (this._recentMessages?.get(replyTo)?.body) || (typeof global !== "undefined" && global.recentMessages?.get(String(replyTo))?.body) || "",
        attachments: rAttach,
        timestamp: (repliedObj.timestamp || "").toString()
      };
    } else if (replyTo && ((this._recentMessages && this._recentMessages.has(replyTo)) || (typeof global !== "undefined" && global.recentMessages && global.recentMessages.has(String(replyTo))))) {
      const cached = (this._recentMessages && this._recentMessages.get(replyTo)) || (global.recentMessages.get(String(replyTo)));
      repliedMessage = {
        messageID: replyTo,
        senderID: cached.senderID,
        body: cached.body || "",
        attachments: Array.isArray(cached.attachments) ? [...cached.attachments] : [],
        timestamp: cached.timestamp || ""
      };
    }

    // Reaction
    if (item.item_type === 'reaction' && item.reaction) {
      return {
        type: 'message_reaction',
        senderID: sid,
        threadID: tid,
        messageID: mid,
        reaction: item.reaction.emoji,
        reactionStatus: item.reaction.reaction_status,
        targetMessageID: item.reaction.item_id?.toString(),
        timestamp: ts
      };
    }

    // Raven / disappearing / visual media
    if (item.item_type === 'raven_media' || item.visual_media || item.raven_media || item.item_type === 'visual_media') {
      const vm = item.visual_media?.media || item.raven_media?.media || item.media;
      const vUrl = vm?.image_versions2?.candidates?.[0]?.url || vm?.candidates?.[0]?.url || vm?.video_versions?.[0]?.url || vm?.url;
      const bodyText = item.text || item.caption?.text || (typeof item.caption === "string" ? item.caption : "") || vm?.caption?.text || (typeof vm?.caption === "string" ? vm?.caption : "") || '';
      return {
        type: 'message',
        senderID: sid,
        body: bodyText,
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: vUrl ? [{
          type: vm?.media_type === 2 ? 'video' : 'photo',
          url: vUrl
        }] : [],
        mentions: {}
      };
    }

    // Media / photo / video / clip / xma share
    if (item.item_type === 'media' || item.item_type === 'photo' ||
        item.item_type === 'video_call_event' || item.item_type === 'clip' || item.clip || item.media_share || item.media || item.image_versions2 || item.xma_share || item.item_type === 'xma') {
      const clipMedia = item.clip?.clip || item.media_share || item.media || item.xma_share || item;
      const mUrl = clipMedia?.image_versions2?.candidates?.[0]?.url || clipMedia?.candidates?.[0]?.url || clipMedia?.video_versions?.[0]?.url || clipMedia?.preview_url || clipMedia?.target_url || clipMedia?.url;
      const bodyText = item.text || item.caption?.text || (typeof item.caption === "string" ? item.caption : "") || clipMedia?.caption?.text || (typeof clipMedia?.caption === "string" ? clipMedia?.caption : "") || '';
      return {
        type: 'message',
        senderID: sid,
        body: bodyText,
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: mUrl ? [{
          type: clipMedia?.media_type === 2 ? 'video' : 'photo',
          url: mUrl
        }] : [],
        mentions: {}
      };
    }

    // Animated / GIF
    if (item.item_type === 'animated_media' || item.animated_media) {
      return {
        type: 'message',
        senderID: sid,
        body: '',
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: [{ type: 'animated_image', url: item.animated_media?.images?.fixed_height?.url }],
        mentions: {}
      };
    }

    // Voice
    if (item.item_type === 'voice_media' || item.voice_media) {
      return {
        type: 'message',
        senderID: sid,
        body: '[Voice Message]',
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: [{ type: 'audio', url: item.voice_media?.media?.audio?.audio_clusters?.[0]?.url }],
        mentions: {}
      };
    }

    // Reel / story share
    if (item.item_type === 'reel_share' || item.item_type === 'story_share') {
      const sMedia = item.reel_share?.media || item.story_share?.media;
      const sUrl = sMedia?.image_versions2?.candidates?.[0]?.url || sMedia?.video_versions?.[0]?.url;
      return {
        type: 'message',
        senderID: sid,
        body: item.reel_share?.text || item.story_share?.text || item.text || '[Story share]',
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: sUrl ? [{ type: sMedia?.media_type === 2 ? 'video' : 'photo', url: sUrl }] : [],
        mentions: {}
      };
    }

    // Text / generic message item (fallback)
    if (item.item_type === 'text' || item.item_type === 'link' || item.text !== undefined || item.body !== undefined) {
      const textAttachments = item.item_type === 'link' && item.link?.link_context ? [{
        type: 'share',
        url: item.link.link_context.link_url,
        title: item.link.link_context.link_title
      }] : [];

      if (textAttachments.length === 0) {
        const mObj = item.media || item.visual_media?.media || item.raven_media?.media || item.clip?.clip || item.media_share || item.xma_share;
        const mUrl = mObj?.image_versions2?.candidates?.[0]?.url
          || mObj?.candidates?.[0]?.url
          || item.image_versions2?.candidates?.[0]?.url
          || mObj?.video_versions?.[0]?.url
          || mObj?.preview_url
          || mObj?.target_url
          || mObj?.url;
        if (mUrl) {
          textAttachments.push({
            type: (mObj?.media_type === 2 || mObj?.video_versions) ? 'video' : 'photo',
            url: mUrl
          });
        }
      }

      return {
        type: 'message',
        senderID: sid,
        body: item.item_type === 'link' ? (item.link?.text || item.text || '') : (item.text || item.body || ''),
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        repliedMessage,
        attachments: textAttachments,
        mentions: {}
      };
    }

    // Typing event embedded as item
    if (item.is_typing !== undefined) {
      return {
        type: 'typ',
        from: sid,
        threadID: tid,
        isTyping: !!item.is_typing
      };
    }

    // Unknown but has text
    if (item.text) {
      return {
        type: 'message',
        senderID: sid,
        body: item.text,
        threadID: tid,
        messageID: mid,
        timestamp: ts,
        isGroup,
        replyTo,
        attachments: [],
        mentions: {}
      };
    }

    return null;
  }

  // Keep old _parseEvent for anything that directly calls it
  _parseEvent(data, topic) {
    return this._parseItem(data, data.thread_id || data.thread_v2_id, topic);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.connectPromise = null;
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
      this.connected = false;
      this.activeEndpoint = null;
      this.subscribedTopics.clear();
      log.info('Disconnected');
    }
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = InstagramMQTTClient;