const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { colors } = require('../func/colors.js');

const logDir = path.join(process.cwd(), 'logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

let config = {};
try {
    // Correcting config path to use the bot's default config or the one in config/
    const configPath = path.join(process.cwd(), 'config', 'default.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.error('Logger: Failed to load config, using defaults.');
}

const logLevel = config.logging?.logLevel || 'info';
const logToFile = config.logging?.logToFile !== false;
const webhookUrl = config.logging?.webhookUrl;

const levels = {
    error: 0,
    warn: 1,
    success: 2,
    info: 3,
    debug: 4,
};

const levelColors = {
    error: 'red',
    warn: 'yellow',
    success: 'cyan',
    info: 'green',
    debug: 'gray',
};

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, tag, ...meta }) => {
        const levelColor = levelColors[level] || 'white';
        const colorFn = colors[levelColor] || (text => text);
        const tagStr = tag ? `[${tag}]` : '';
        const levelStr = level.toUpperCase().padEnd(7);

        const coloredLevel = colorFn(levelStr);
        const coloredTag = tag ? (colors.magenta ? colors.magenta(tagStr) : tagStr) : '';

        const metaEntries = Object.entries(meta).filter(([key]) => !['timestamp', 'level', 'tag', 'splat'].includes(key));
        const metaStr = metaEntries.length ? `\n${colors.gray ? colors.gray(JSON.stringify(Object.fromEntries(metaEntries), null, 2)) : JSON.stringify(Object.fromEntries(metaEntries), null, 2)}` : '';

        return `${colors.gray ? colors.gray(timestamp) : timestamp} ${coloredLevel} ${coloredTag} ${message}${metaStr}`;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

class WebhookTransport extends winston.Transport {
    constructor(opts) {
        super(opts);
        this.url = opts.url;
    }
    log(info, callback) {
        if (this.url) {
            axios.post(this.url, {
                content: `**[${info.level.toUpperCase()}]** ${info.tag ? `[${info.tag}] ` : ''}${info.message}`
            }).catch(() => {});
        }
        callback();
    }
}

const transports = [
    new winston.transports.Console({
        level: logLevel,
        format: consoleFormat,
    })
];

if (logToFile) {
    transports.push(
        new winston.transports.DailyRotateFile({
            level: 'info',
            filename: path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: fileFormat,
        }),
        new winston.transports.DailyRotateFile({
            level: 'error',
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: fileFormat,
        })
    );
}

if (webhookUrl) {
    transports.push(new WebhookTransport({ level: 'warn', url: webhookUrl }));
}

const logger = winston.createLogger({ levels, transports });
module.exports = logger;
