const logger = require('./index.js');

/**
 * Simplifies large objects like Axios errors to prevent log pollution
 */
function simplifyObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

    // Check if it's an Axios error or similar large request error
    if (obj.isAxiosError || obj.config || obj.response) {
        return {
            message: obj.message,
            code: obj.code,
            status: obj.response?.status,
            method: obj.config?.method?.toUpperCase(),
            url: obj.config?.url,
            data: typeof obj.response?.data === 'string'
                ? (obj.response.data.length > 500 ? obj.response.data.slice(0, 500) + '...' : obj.response.data)
                : (typeof obj.response?.data === 'object' ? '[Object]' : obj.response?.data)
        };
    }
    return obj;
}

/**
 * Enhanced formatAndLog function to handle various argument styles
 * @param {string} level The log level (info, success, warn, error, debug)
 * @param {Array} args The arguments passed to the log function
 */
function formatAndLog(level, args) {
    let tag = '';
    let message = '';
    let meta = {};

    if (args.length === 1) {
        message = args[0];
    } else if (args.length >= 2) {
        // If the first argument is a short uppercase string, treat it as a tag
        if (typeof args[0] === 'string' && (args[0] === args[0].toUpperCase() || args[0].length < 15)) {
            tag = args[0];
            message = args[1];
            if (args.length > 2) {
                meta = typeof args[2] === 'object' && !Array.isArray(args[2]) ? args[2] : { details: args.slice(2) };
            }
        } else {
            message = args[0];
            meta = typeof args[1] === 'object' && !Array.isArray(args[1]) ? args[1] : { details: args.slice(1) };
        }
    }

    // Apply simplification to message and meta properties
    const processedMessage = simplifyObject(message);
    if (meta.error) meta.error = simplifyObject(meta.error);
    if (meta.reason) meta.reason = simplifyObject(meta.reason);
    if (meta.details) {
        if (Array.isArray(meta.details)) meta.details = meta.details.map(simplifyObject);
        else meta.details = simplifyObject(meta.details);
    }

    logger.log({
        level,
        tag,
        message: typeof processedMessage === 'object' ? JSON.stringify(processedMessage, null, 2) : String(processedMessage),
        ...meta
    });
}

module.exports = {
    err: (...args) => formatAndLog('error', args),
    error: (...args) => formatAndLog('error', args),
    warn: (...args) => formatAndLog('warn', args),
    info: (...args) => formatAndLog('info', args),
    succes: (...args) => formatAndLog('success', args),
    success: (...args) => formatAndLog('success', args),
    debug: (...args) => formatAndLog('debug', args),
    master: (...args) => formatAndLog('info', ['MASTER', ...args]),
    dev: (...args) => {
        // Log dev messages if NODE_ENV is development or if specifically enabled in config
        if (process.env.NODE_ENV === 'development') formatAndLog('debug', ['DEV', ...args]);
    },
    load: (...args) => formatAndLog('info', ['LOAD', ...args]),
    box: (...args) => require('../src/logger').box(...args)
};
