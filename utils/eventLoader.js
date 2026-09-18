const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('../config');

class EventLoader {
  constructor(bot) {
    this.bot = bot;
    this.events = new Map();
  }

  async loadEvents() {
    const eventsPath = path.resolve(config.EVENTS_PATH);
    if (!fs.existsSync(eventsPath)) {
      logger.warn('Events directory not found, creating it');
      fs.mkdirSync(eventsPath, { recursive: true });
      return;
    }
    const files = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
    logger.info(`Loading ${files.length} events...`);
    for (const file of files) {
      try {
        const fp = path.join(eventsPath, file);
        delete require.cache[require.resolve(fp)];
        const ev = require(fp);
        if (!ev.config || !ev.config.name) { logger.warn(`Event ${file} missing config.name, skipping`); continue; }
        this.events.set(ev.config.name, ev);
        logger.info(`Loaded event: ${ev.config.name}`);
      } catch (e) { logger.error(`Failed to load event ${file}`, { error: e.message }); }
    }
    logger.info(`Successfully loaded ${this.events.size} events`);
  }

  registerEvents() {
    this.events.forEach((ev, name) => {
      if (typeof ev.run === 'function') logger.debug(`Registered event handler: ${name}`);
    });
  }

  async handleEvent(name, data) {
    const ev = this.events.get(name);

    // Support for handlerEvents global in GoatV2
    for (const [eventName, eventCmd] of this.events) {
        if (typeof eventCmd.onStart === 'function') {
            eventCmd.onStart({
                api: this.bot.api,
                event: data,
                bot: this.bot,
                database: require('./database'),
                usersData: require('./database').usersData,
                threadsData: require('./database').threadsData,
                getLang: (...args) => require('../utils.js').getText(eventCmd.config.name, ...args)
            }).catch(e => logger.error(`Error in event script ${eventName}`, { error: e.message }));
        }
    }

    if (!ev) { logger.debug(`No handler for event: ${name}`); return; }
    try { await ev.run(this.bot, data); }
    catch (e) { logger.error(`Error handling event ${name}`, { error: e.message, stack: e.stack }); }
  }

  getAllEventNames() { return Array.from(this.events.keys()); }
}

module.exports = EventLoader;
