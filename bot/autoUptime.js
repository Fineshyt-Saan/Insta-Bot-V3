'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

if (global.timeOutUptime !== undefined) {
	clearTimeout(global.timeOutUptime);
}

if (!config.AUTO_UPTIME_ENABLE) {
	return;
}

const PORT = config.DASHBOARD_PORT || config.SERVER_UPTIME_PORT || 3000;

let myUrl = config.AUTO_UPTIME_URL || `http://localhost:${PORT}/api/status`;

let status = 'ok';
setTimeout(async function autoUptime() {
	try {
		await axios.get(myUrl);
		if (status !== 'ok') {
			status = 'ok';
			logger.info('AutoUptime: Bot dashboard/status is online');
		}
	} catch (e) {
		if (status !== 'failed') {
			status = 'failed';
			logger.warn('AutoUptime check failed', { url: myUrl, error: e.message });
		}
	}
	global.timeOutUptime = setInterval(autoUptime, (config.AUTO_UPTIME_INTERVAL || 180) * 1000);
}, (config.AUTO_UPTIME_INTERVAL || 180) * 1000);

logger.info(`AutoUptime enabled targeting: ${myUrl}`);

