"use strict";

const { getRandom } = require("./constants");

const BROWSER_DATA = {
    windows: {
        platform: "Windows NT 10.0; Win64; x64",
        chromeVersions: ["133.0.6943.53", "132.0.6834.160", "131.0.6778.205", "130.0.6723.116"],
        edgeVersions: ["133.0.3065.59", "132.0.2957.140", "131.0.2903.112"],
        platformVersion: '"15.0.0"'
    },
    mac: {
        platform: "Macintosh; Intel Mac OS X 10_15_7",
        chromeVersions: ["133.0.6943.53", "132.0.6834.160", "131.0.6778.205", "130.0.6723.116"],
        edgeVersions: ["133.0.3065.59", "132.0.2957.140", "131.0.2903.112"],
        platformVersion: '"15.2.0"'
    },
    linux: {
        platform: "X11; Linux x86_64",
        chromeVersions: ["133.0.6943.53", "132.0.6834.160", "131.0.6778.205"],
        edgeVersions: ["133.0.3065.59", "132.0.2957.140"],
        platformVersion: '""'
    }
};

const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomBuildId() {
    const prefixes = ["UP1A", "AP4A", "UQ1A", "TP1A"];
    return `${randomChoice(prefixes)}.${randomInt(230000, 250000)}.${randomInt(10, 99)}`;
}

function randomResolution() {
    const presets = [
        { width: 1080, height: 2340, density: 2.875 },
        { width: 1080, height: 2400, density: 3.0 },
        { width: 1440, height: 3120, density: 3.5 },
        { width: 1440, height: 3200, density: 4.0 },
        { width: 1179, height: 2556, density: 3.0 }
    ];
    return randomChoice(presets);
}

function randomFbav() {
    return `${randomInt(350, 360)}.0.0.${randomInt(10, 50)}.${randomInt(100, 200)}`;
}

function randomOrcaUA() {
    const androidVersions = ["12", "13", "14", "15"];
    const devices = [
        { brand: "samsung", model: "SM-S928B" },
        { brand: "samsung", model: "SM-S918B" },
        { brand: "Google", model: "Pixel 8 Pro" },
        { brand: "Google", model: "Pixel 7a" },
        { brand: "Xiaomi", model: "23127PN0CG" },
        { brand: "OnePlus", model: "CPH2581" },
        { brand: "OPPO", model: "CPH2525" },
        { brand: "vivo", model: "V2309" }
    ];
    const carriers = [
        "T-Mobile", "Verizon", "AT&T", "Vodafone",
        "Orange", "Jio", "Airtel", "Viettel Telecom",
        "Telkomsel", "NTT DOCOMO"
    ];
    const locales = [
        "en_US", "en_GB", "es_ES", "fr_FR",
        "de_DE", "id_ID", "vi_VN", "pt_BR"
    ];
    const archs = ["arm64-v8a", "armeabi-v7a"];

    const androidVersion = randomChoice(androidVersions);
    const device = randomChoice(devices);
    const buildId = randomBuildId();
    const resolution = randomResolution();
    const fbav = randomFbav();
    const fbbv = randomInt(640000000, 680000000);
    const arch = `${randomChoice(archs)}:${randomChoice(archs)}`;
    const selectedLocale = randomChoice(locales);
    const selectedCarrier = randomChoice(carriers);

    const userAgent = `Mozilla/5.0 (Linux; Android ${androidVersion}; ${device.model} Build/${buildId}; wv) ` +
        `AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.53 Mobile Safari/537.36 ` +
        `Instagram ${fbav} Android (${androidVersion}; ${resolution.density * 160}dpi; ${resolution.width}x${resolution.height}; ${device.brand}; ${device.model}; ${device.model}; qcom; ${selectedLocale}; ${fbbv})`;

    return {
        userAgent,
        androidVersion,
        device,
        buildId,
        resolution,
        fbav,
        fbbv,
        locale: selectedLocale,
        carrier: selectedCarrier
    };
}

/**
 * Generates a realistic, randomized User-Agent string and related Sec-CH headers.
 * Supports Chrome and Edge browsers across Windows, macOS, and Linux.
 */
function randomUserAgent() {
    const os = randomChoice(Object.keys(BROWSER_DATA));
    const data = BROWSER_DATA[os];

    const useEdge = Math.random() > 0.7 && data.edgeVersions;
    const versions = useEdge ? data.edgeVersions : data.chromeVersions;
    const version = randomChoice(versions);
    const majorVersion = version.split('.')[0];
    const browserName = useEdge ? 'Microsoft Edge' : 'Google Chrome';

    const userAgent = useEdge 
        ? `Mozilla/5.0 (${data.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36 Edg/${version}`
        : `Mozilla/5.0 (${data.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    const greeseValue = Math.random() > 0.5 ? '99' : '8';
    const brands = useEdge ? [
        `"Chromium";v="${majorVersion}"`,
        `"Not(A:Brand";v="${greeseValue}"`,
        `"${browserName}";v="${majorVersion}"`
    ] : [
        `"${browserName}";v="${majorVersion}"`,
        `"Not;A=Brand";v="${greeseValue}"`,
        `"Chromium";v="${majorVersion}"`
    ];

    const secChUa = brands.join(', ');
    const secChUaFullVersionList = brands.map(b => {
        const match = b.match(/v="(\d+)"/);
        if (match && match[1] === majorVersion) {
            return b.replace(`v="${majorVersion}"`, `v="${version}"`);
        }
        return b;
    }).join(', ');

    const platformName = os === 'windows' ? 'Windows' : os === 'mac' ? 'macOS' : 'Linux';

    return {
        userAgent,
        secChUa,
        secChUaFullVersionList,
        secChUaPlatform: `"${platformName}"`,
        secChUaPlatformVersion: data.platformVersion,
        browser: browserName
    };
}

function generateUserAgentByPersona(persona = 'desktop', options = {}) {
    if (persona === 'android' || persona === 'mobile') {
        if (options.cachedAndroidUA && options.cachedAndroidDevice) {
            return {
                userAgent: options.cachedAndroidUA,
                androidVersion: options.cachedAndroidVersion,
                device: options.cachedAndroidDevice,
                buildId: options.cachedAndroidBuildId,
                resolution: options.cachedAndroidResolution,
                fbav: options.cachedAndroidFbav,
                fbbv: options.cachedAndroidFbbv,
                locale: options.cachedAndroidLocale,
                carrier: options.cachedAndroidCarrier,
                persona: 'android'
            };
        }

        const androidData = randomOrcaUA();
        return {
            ...androidData,
            persona: 'android'
        };
    }

    if (options.cachedUserAgent && options.cachedSecChUa) {
        return {
            userAgent: options.cachedUserAgent,
            secChUa: options.cachedSecChUa,
            secChUaFullVersionList: options.cachedSecChUaFullVersionList,
            secChUaPlatform: options.cachedSecChUaPlatform,
            secChUaPlatformVersion: options.cachedSecChUaPlatformVersion,
            browser: options.cachedBrowser || 'Google Chrome',
            persona: 'desktop'
        };
    }

    const desktopData = randomUserAgent();
    return {
        ...desktopData,
        persona: 'desktop'
    };
}

function cachePersonaData(options, personaData) {
    if (personaData.persona === 'android') {
        options.cachedAndroidUA = personaData.userAgent;
        options.cachedAndroidVersion = personaData.androidVersion;
        options.cachedAndroidDevice = personaData.device;
        options.cachedAndroidBuildId = personaData.buildId;
        options.cachedAndroidResolution = personaData.resolution;
        options.cachedAndroidFbav = personaData.fbav;
        options.cachedAndroidFbbv = personaData.fbbv;
        options.cachedAndroidLocale = personaData.locale;
        options.cachedAndroidCarrier = personaData.carrier;
    } else {
        options.cachedUserAgent = personaData.userAgent;
        options.cachedSecChUa = personaData.secChUa;
        options.cachedSecChUaFullVersionList = personaData.secChUaFullVersionList;
        options.cachedSecChUaPlatform = personaData.secChUaPlatform;
        options.cachedSecChUaPlatformVersion = personaData.secChUaPlatformVersion;
        options.cachedBrowser = personaData.browser;
    }
    return options;
}

module.exports = {
    defaultUserAgent,
    windowsUserAgent: defaultUserAgent,
    randomUserAgent,
    randomBuildId,
    randomResolution,
    randomFbav,
    randomOrcaUA,
    generateUserAgentByPersona,
    cachePersonaData,
};