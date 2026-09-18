/**
 * @fileoverview NKXICA - MQTT Real-time Client
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module MQTTClient
 * @since 1.0.0
 */

const mqtt = require('mqtt');
const EventEmitter = require('events');
const { mqttLog: log } = require('../utils/logger');
const FormatUtils = require('../utils/formatter');

class MQTTClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.deviceId = options.deviceId;
    this.userId = options.userId;
    this.authorization = options.authorization;
    this.cookies = options.cookies || '';
    this.userAgent = options.userAgent || '';
    this.mqttClient = null;
    this.connected = false;
    this.topics = [];
  }

  // Connect to MQTT broker
  async connect() {
    return new Promise((resolve, reject) => {
      if (!this.userId || !this.authorization) {
        return reject(new Error('User ID and authorization required'));
      }

      // Get cookies from authorization or options
      const cookies = this.cookies || '';
      
      const mqttOptions = {
        clientId: this.deviceId,
        username: this.userId,
        password: this.authorization.replace('Bearer ', ''),
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        clean: true,
        rejectUnauthorized: false,
        protocol: 'wss',
        protocolVersion: 4,  // MQTT 3.1.1
        // Custom headers for WebSocket upgrade
        wsOptions: {
          headers: {
            'User-Agent': this.userAgent || 'Instagram 350.0.0.0.0 Android (28/8.1.0; 480dpi; 1080x1920; Google; Pixel 2; walleye; qcom; en_US; 143991798)',
            'Accept-Language': 'en-US',
            'Cookie': cookies,
            'Origin': 'https://www.instagram.com',
            'Referer': 'https://www.instagram.com/'
          }
        },
        // Transform WebSocket URL if needed
        transformWsUrl: (url, options, client) => {
          log.silly('WebSocket URL:', url);
          return url;
        }
      };

      // Instagram MQTT endpoints - these ARE correct (Meta infrastructure)
      const endpoints = [
        'wss://edge-chat.instagram.com/chat',
        'wss://edge-mqtt.facebook.com:443',
        'wss://mqtt-mini.facebook.com:443'
      ];

      let connected = false;
      
      const tryConnect = (index = 0) => {
        if (index >= endpoints.length) {
          return reject(new Error('Failed to connect to any MQTT endpoint'));
        }

        const endpoint = endpoints[index];
        log.info(`Connecting to ${endpoint}...`);

        this.mqttClient = mqtt.connect(endpoint, mqttOptions);

        this.mqttClient.on('connect', () => {
          connected = true;
          this.connected = true;
          log.info('Connected to MQTT');
          this.emit('connected');
          this.subscribeToTopics();
          resolve();
        });

        this.mqttClient.on('message', (topic, message) => {
          this.handleMessage(topic, message);
        });

        this.mqttClient.on('error', (err) => {
          log.error('Connection error:', err.message);
          this.emit('error', err);
          
          if (!connected) {
            this.mqttClient.end(true);
            tryConnect(index + 1);
          }
        });

        this.mqttClient.on('close', () => {
          this.connected = false;
          log.warn('Connection closed');
          this.emit('disconnected');
        });

        this.mqttClient.on('reconnect', () => {
          log.info('Reconnecting...');
          this.emit('reconnecting');
        });
      };

      tryConnect();
    });
  }

  // Subscribe to topics
  subscribeToTopics() {
    this.topics = [
      `/ig_realtime_sub/${this.userId}`,
      `/ig_message_sync/${this.userId}`,
      `/ig_realtime/${this.userId}`,
      `/ig/pubsub/topics/ig/u/${this.userId}`
    ];

    this.topics.forEach(topic => {
      this.mqttClient.subscribe(topic, (err) => {
        if (err) {
          log.error(`Failed to subscribe to ${topic}:`, err.message);
        } else {
          log.silly(`Subscribed to ${topic}`);
        }
      });
    });
  }

  // Handle incoming MQTT messages
  handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      log.silly('Received message on', topic);
      
      const event = this.parseEvent(data);
      if (event) {
        this.emit('event', event);
      }
    } catch (error) {
      // Ignore parse errors
      log.silly('Failed to parse message:', error.message);
    }
  }

  // Parse MQTT data to event format
  parseEvent(data) {
    // Parse different event types
    if (data.event === 'message' || data.item_type) {
      return {
        type: 'message',
        senderID: data.user_id?.toString(),
        body: data.text || '',
        threadID: data.thread_id?.toString(),
        messageID: data.item_id?.toString(),
        timestamp: data.timestamp?.toString(),
        isGroup: data.is_group === true || !!(data.thread_id?.toString().includes(':')),
        replyTo: (data.replied_to_message?.item_id || data.replied_to_message?.id)?.toString()
          || (data.replied_to_item?.item_id || data.replied_to_item?.id)?.toString()
          || data.replied_to_item_id?.toString()
          || data.reply_to_item?.item_id?.toString()
          || data.reply_to_item_id?.toString()
          || data.reply_to_message?.item_id?.toString()
          || data.reply_to_message_id?.toString()
          || data.quoted_item?.item_id?.toString()
          || null,
        attachments: this.parseAttachments(data),
        mentions: {}
      };
    }

    if (data.event_type === 'read' || data.action === 'mark_seen') {
      return {
        type: 'read_receipt',
        reader: data.reader_id?.toString() || data.user_id?.toString(),
        threadID: data.thread_id?.toString(),
        timestamp: data.timestamp?.toString()
      };
    }

    if (data.event_type === 'typing' || data.action === 'indicate_activity') {
      return {
        type: 'typ',
        from: data.user_id?.toString(),
        threadID: data.thread_id?.toString(),
        isTyping: data.is_typing || data.activity_status === '1'
      };
    }

    if (data.event_type === 'reaction' || data.reacji) {
      return {
        type: 'message_reaction',
        senderID: data.user_id?.toString(),
        messageID: data.item_id?.toString(),
        reaction: data.reacji,
        threadID: data.thread_id?.toString(),
        timestamp: data.timestamp?.toString()
      };
    }

    if (data.event_type === 'thread_update') {
      return {
        type: 'thread_update',
        threadID: data.thread_id?.toString(),
        updateType: data.update_type,
        timestamp: data.timestamp?.toString()
      };
    }

    return null;
  }

  // Parse attachments from data
  parseAttachments(data) {
    const attachments = [];

    if (data.media) {
      attachments.push({
        type: data.media.media_type === 1 ? 'photo' : 'video',
        url: data.media.image_versions2?.candidates?.[0]?.url,
        width: data.media.image_versions2?.candidates?.[0]?.width,
        height: data.media.image_versions2?.candidates?.[0]?.height
      });
    }

    if (data.voice_media) {
      attachments.push({
        type: 'audio',
        url: data.voice_media?.media?.audio?.audio_clusters?.[0]?.url,
        duration: data.voice_media?.media?.audio?.audio_clusters?.[0]?.duration
      });
    }

    if (data.animated_media) {
      attachments.push({
        type: 'animated_image',
        url: data.animated_media?.images?.fixed_height?.url
      });
    }

    if (data.link) {
      attachments.push({
        type: 'share',
        url: data.link?.link_context?.link_url,
        title: data.link?.link_context?.link_title
      });
    }

    return attachments;
  }

  // Disconnect from MQTT
  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
      this.connected = false;
    }
  }

  // Check if connected
  isConnected() {
    return this.connected && this.mqttClient !== null;
  }
}

module.exports = MQTTClient;