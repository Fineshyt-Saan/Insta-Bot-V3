const logger = require('./logger');
const config = require('../config');

class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastMessageTime = 0;
    this.consecutiveErrors = 0;
  }

  /**
   * Add message to queue
   * @param {Function} sendFunction - Function to send the message
   * @param {Object} context - Message context
   */
  add(sendFunction, context = {}) {
    this.queue.push({ sendFunction, context, timestamp: Date.now(), retries: 0 });
    logger.debug('Message added to queue', { queueLength: this.queue.length });
    
    if (!this.processing) {
      this.process();
    }
  }

  /**
   * Generate human-like random delay (200-800ms)
   */
  getRandomDelay() {
    return Math.floor(Math.random() * 600) + 200;
  }

  /**
   * Process message queue with rate limiting and retry logic
   */
  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      const { sendFunction, context, retries } = item;
      
      // Rate limiting with human-like random delay
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;
      const baseDelay = config.MESSAGE_DELAY_MS || 100;
      const randomDelay = this.getRandomDelay();
      const totalDelay = baseDelay + randomDelay;
      
      if (timeSinceLastMessage < totalDelay) {
        const delay = totalDelay - timeSinceLastMessage;
        logger.debug(`Rate limiting: waiting ${delay}ms (base: ${baseDelay}ms, random: ${randomDelay}ms)`);
        await this.sleep(delay);
      }

      // Add extra delay if we've had consecutive errors (backoff)
      if (this.consecutiveErrors > 0) {
        const backoffDelay = Math.min(this.consecutiveErrors * 1000, 5000);
        logger.warn(`Backing off due to errors: waiting additional ${backoffDelay}ms`);
        await this.sleep(backoffDelay);
      }

      try {
        await sendFunction();
        this.lastMessageTime = Date.now();
        this.consecutiveErrors = 0;
        logger.debug('Message sent successfully', context);
      } catch (error) {
        this.consecutiveErrors++;
        logger.error('Failed to send message', { 
          error: error.message, 
          context,
          retries,
          consecutiveErrors: this.consecutiveErrors
        });
        
        // Retry logic for transient errors
        if (retries < 2 && this.shouldRetry(error)) {
          logger.info(`Retrying message (attempt ${retries + 1}/2)`);
          item.retries = retries + 1;
          // Re-add to queue with delay
          await this.sleep(2000 * (retries + 1));
          this.queue.unshift(item);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Determine if an error should trigger a retry
   */
  shouldRetry(error) {
    const message = error.message || '';
    // Retry on network errors, timeouts, but not on auth or spam errors
    return message.includes('timeout') || 
           message.includes('ECONNRESET') ||
           message.includes('ETIMEDOUT') ||
           message.includes('network');
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue length
   * @returns {number} Number of messages in queue
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    logger.info('Message queue cleared');
  }
}

module.exports = MessageQueue;
