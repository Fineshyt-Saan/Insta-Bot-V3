'use strict';

const logger = require('../utils/logger');

module.exports = async function ({ api, threadsData, usersData, globalData, getText }) {
        if (typeof api.refreshFb_dtsg === "function") {
                setInterval(async () => {
                        api.refreshFb_dtsg()
                                .then(() => {
                                        logger.info("refreshedFb_dtsg successfully");
                                })
                                .catch((err) => {
                                        logger.error("Error refreshing fb_dtsg", { error: err.message });
                                });
                }, 1000 * 60 * 60 * 48);
        }
};

