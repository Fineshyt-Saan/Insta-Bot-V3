/**
 * @fileoverview NKXICA - Database (SQLite) Module
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Database
 * @since 1.0.0
 */

const { nkxicaLog: log } = require('../utils/logger');

let Sequelize, DataTypes;
try {
  const seq = require('sequelize');
  Sequelize = seq.Sequelize;
  DataTypes = seq.DataTypes;
} catch (_) {}

class Database {
  constructor(options = {}) {
    this.storage = options.storage || './instagram_chat.db';
    this.logging = options.logging || false;
    this.sequelize = null;
    this.models = {};
  }

  // Initialize database
  async init() {
    if (!Sequelize) {
      log.warn('Sequelize is not installed. SQLite database features will be disabled.');
      return false;
    }
    try {
      this.sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: this.storage,
        logging: this.logging ? console.log : false
      });

      this.defineModels();
      await this.sequelize.sync();
      
      log.info('Database initialized');
      return true;
    } catch (error) {
      log.error('Database initialization failed:', error.message);
      throw error;
    }
  }

  // Define database models
  defineModels() {
    if (!this.sequelize || !DataTypes) return;
    // Messages model
    this.models.Message = this.sequelize.define('Message', {
      id: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      threadId: DataTypes.STRING,
      senderId: DataTypes.STRING,
      body: DataTypes.TEXT,
      timestamp: DataTypes.BIGINT,
      type: DataTypes.STRING,
      attachments: DataTypes.JSON,
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      raw: DataTypes.JSON
    });

    // Threads model
    this.models.Thread = this.sequelize.define('Thread', {
      id: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      name: DataTypes.STRING,
      type: DataTypes.STRING,
      participants: DataTypes.JSON,
      unreadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      lastActivityAt: DataTypes.BIGINT,
      isMuted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      isArchived: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      raw: DataTypes.JSON
    });

    // Users model
    this.models.User = this.sequelize.define('User', {
      id: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      username: DataTypes.STRING,
      fullName: DataTypes.STRING,
      profilePicUrl: DataTypes.STRING,
      isVerified: DataTypes.BOOLEAN,
      isPrivate: DataTypes.BOOLEAN,
      lastSeen: DataTypes.BIGINT,
      raw: DataTypes.JSON
    });

    // Sessions model
    this.models.Session = this.sequelize.define('Session', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      username: {
        type: DataTypes.STRING,
        unique: true
      },
      userId: DataTypes.STRING,
      sessionData: DataTypes.JSON
    });
  }

  // Save message
  async saveMessage(message) {
    try {
      await this.models.Message.upsert({
        id: message.messageID,
        threadId: message.threadID,
        senderId: message.senderID,
        body: message.body,
        timestamp: parseInt(message.timestamp),
        type: message.type,
        attachments: message.attachments,
        raw: message
      });
    } catch (error) {
      log.error('Failed to save message:', error.message);
    }
  }

  // Get messages by thread
  async getMessagesByThread(threadId, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      return await this.models.Message.findAll({
        where: { threadId },
        order: [['timestamp', 'DESC']],
        limit,
        offset
      });
    } catch (error) {
      log.error('Failed to get messages:', error.message);
      return [];
    }
  }

  // Save thread
  async saveThread(thread) {
    try {
      await this.models.Thread.upsert({
        id: thread.threadID,
        name: thread.name,
        type: thread.isGroup ? 'group' : 'direct',
        participants: thread.participants,
        unreadCount: thread.unreadCount,
        lastActivityAt: parseInt(thread.serverTimestamp),
        isMuted: thread.muted,
        isArchived: thread.isArchived,
        raw: thread
      });
    } catch (error) {
      log.error('Failed to save thread:', error.message);
    }
  }

  // Get all threads
  async getThreads(options = {}) {
    try {
      const limit = options.limit || 50;
      return await this.models.Thread.findAll({
        order: [['lastActivityAt', 'DESC']],
        limit
      });
    } catch (error) {
      log.error('Failed to get threads:', error.message);
      return [];
    }
  }

  // Save user
  async saveUser(user) {
    try {
      await this.models.User.upsert({
        id: user.userID,
        username: user.username,
        fullName: user.fullName,
        profilePicUrl: user.profilePicUrl,
        isVerified: user.isVerified,
        isPrivate: user.isPrivate,
        raw: user
      });
    } catch (error) {
      log.error('Failed to save user:', error.message);
    }
  }

  // Get user by ID
  async getUser(userId) {
    try {
      return await this.models.User.findByPk(userId);
    } catch (error) {
      log.error('Failed to get user:', error.message);
      return null;
    }
  }

  // Save session
  async saveSession(username, userId, sessionData) {
    try {
      const existing = await this.models.Session.findOne({ where: { username } });
      if (existing) {
        await existing.update({ userId, sessionData });
      } else {
        await this.models.Session.create({ username, userId, sessionData });
      }
    } catch (error) {
      log.error('Failed to save session:', error.message);
    }
  }

  // Get session
  async getSession(username) {
    try {
      return await this.models.Session.findOne({
        where: { username },
        order: [['updatedAt', 'DESC']]
      });
    } catch (error) {
      log.error('Failed to get session:', error.message);
      return null;
    }
  }

  // Clear old data
  async cleanup(days = 30) {
    try {
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      await this.models.Message.destroy({
        where: { timestamp: { [Sequelize.Op.lt]: cutoff } }
      });
      
      log.info(`Cleaned up data older than ${days} days`);
    } catch (error) {
      log.error('Cleanup failed:', error.message);
    }
  }

  // Close database
  async close() {
    if (this.sequelize) {
      await this.sequelize.close();
      log.info('Database connection closed');
    }
  }
}

module.exports = Database;