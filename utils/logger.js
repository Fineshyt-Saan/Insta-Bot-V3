const log = require('../logger/log.js');

/**
 * Bridge between the V2 consolidated logger and the local utils/logger.
 * This ensures consistency across the codebase.
 */
module.exports = {
    info: (message, meta = {}) => log.info(message, meta),
    success: (message, meta = {}) => log.success(message, meta),
    warn: (message, meta = {}) => log.warn(message, meta),
    error: (message, meta = {}) => log.error(message, meta),
    debug: (message, meta = {}) => log.debug(message, meta),
    command: (name, user, ok = true) => {
        const message = `${name} executed by ${user}`;
        if (ok) log.success('COMMAND', message);
        else log.error('COMMAND', message);
    }
};
