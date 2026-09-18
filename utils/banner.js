const logger = require('./logger');
const config = require('../config');

class Banner {
  static display() {
    console.log('\x1b[36m%s\x1b[0m', `
  ██╗███╗   ██╗███████╗████████╗ █████╗ ██████╗  ██████╗ ████████╗
  ██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
  ██║██╔██╗ ██║███████╗   ██║   ███████║██████╔╝██║   ██║   ██║
  ██║██║╚██╗██║╚════██║   ██║   ██╔══██║██╔══██╗██║   ██║   ██║
  ██║██║ ╚████║███████║   ██║   ██║  ██║██████╔╝╚██████╔╝   ██║
  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝
                              InstaBOT v${config.BOT_VERSION} by frnAlt & lazyneoaz
`);
  }

  static startupMessage(userID, username, commandCount, eventCount) {
    logger.success(`${config.NICK_NAME_BOT} started successfully`);
    logger.info(`User: @${username || 'Loading...'} (${userID || 'Loading...'})`);
    logger.info(`Loaded ${commandCount} commands and ${eventCount} events`);
    logger.info(`Prefix: ${config.PREFIX}`);
    logger.success('Listening for messages...');
  }

  static commandExecuted(name, user, ok = true) { logger.command(name, user, ok); }

  static messageReceived(from, preview) {
    let p = '';
    try { p = typeof preview === 'string' ? preview : JSON.stringify(preview); } catch (_) { p = '[n/a]'; }
    if (p) {
      logger.info(`📩 Message from ${from}: "${p.length > 60 ? p.substring(0, 60) + '...' : p}"`);
    }
  }

  static error(ctx, err) { logger.error(`${ctx}: ${err}`); }
  static info(msg)    { logger.info(msg); }
  static warning(msg) { logger.warn(msg); }
  static success(msg) { logger.success(msg); }
}

module.exports = Banner;
