/**
 * @fileoverview NKXICA - Task Scheduler
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module Scheduler
 * @since 1.0.0
 */

const cron = require('node-cron');
const EventEmitter = require('events');
const { nkxicaLog: log } = require('./logger');

class Scheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.tasks = new Map();
    this.enabled = options.enabled !== false;
  }

  // Schedule a recurring task
  schedule(name, cronExpression, task, options = {}) {
    if (!this.enabled) {
      log.warn('Scheduler is disabled');
      return null;
    }

    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    const job = cron.schedule(cronExpression, async () => {
      try {
        log.silly(`Running task: ${name}`);
        await task();
        this.emit('taskComplete', { name, success: true });
      } catch (error) {
        log.error(`Task ${name} failed:`, error.message);
        this.emit('taskError', { name, error });
      }
    }, {
      scheduled: options.start !== false,
      timezone: options.timezone
    });

    this.tasks.set(name, { job, expression: cronExpression, options });
    log.info(`Scheduled task: ${name} (${cronExpression})`);
    
    return job;
  }

  // Schedule a one-time task
  scheduleOnce(name, delayMs, task) {
    setTimeout(async () => {
      try {
        await task();
        this.emit('taskComplete', { name, success: true });
      } catch (error) {
        log.error(`One-time task ${name} failed:`, error.message);
        this.emit('taskError', { name, error });
      }
    }, delayMs);

    log.info(`Scheduled one-time task: ${name} (in ${delayMs}ms)`);
  }

  // Stop a scheduled task
  stop(name) {
    const task = this.tasks.get(name);
    if (task) {
      task.job.stop();
      log.info(`Stopped task: ${name}`);
      return true;
    }
    return false;
  }

  // Start a stopped task
  start(name) {
    const task = this.tasks.get(name);
    if (task) {
      task.job.start();
      log.info(`Started task: ${name}`);
      return true;
    }
    return false;
  }

  // Remove a task
  remove(name) {
    const task = this.tasks.get(name);
    if (task) {
      task.job.destroy();
      this.tasks.delete(name);
      log.info(`Removed task: ${name}`);
      return true;
    }
    return false;
  }

  // Stop all tasks
  stopAll() {
    for (const [name, task] of this.tasks) {
      task.job.stop();
    }
    log.info('Stopped all tasks');
  }

  // Start all tasks
  startAll() {
    for (const [name, task] of this.tasks) {
      task.job.start();
    }
    log.info('Started all tasks');
  }

  // List all tasks
  list() {
    return Array.from(this.tasks.entries()).map(([name, task]) => ({
      name,
      expression: task.expression,
      running: task.job.getStatus() === 'scheduled'
    }));
  }

  // Common schedule helpers
  everyMinute(name, task, options = {}) {
    return this.schedule(name, '* * * * *', task, options);
  }

  every5Minutes(name, task, options = {}) {
    return this.schedule(name, '*/5 * * * *', task, options);
  }

  every15Minutes(name, task, options = {}) {
    return this.schedule(name, '*/15 * * * *', task, options);
  }

  everyHour(name, task, options = {}) {
    return this.schedule(name, '0 * * * *', task, options);
  }

  daily(name, task, options = {}) {
    const hour = options.hour || 0;
    const minute = options.minute || 0;
    return this.schedule(name, `${minute} ${hour} * * *`, task, options);
  }

  weekly(name, task, options = {}) {
    const day = options.day || 0; // 0 = Sunday
    const hour = options.hour || 0;
    const minute = options.minute || 0;
    return this.schedule(name, `${minute} ${hour} * * ${day}`, task, options);
  }
}

module.exports = Scheduler;