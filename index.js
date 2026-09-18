"use strict";

/**
 * InstaBOT — a modular Instagram Direct chat bot.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 * GitHub: https://github.com/lazyneoaz
 * License: MIT
 *
 * Usage:
 *   1. npm install
 *   2. put your Instagram cookies in account.txt
 *   3. npm start
 */

const utils = require("./utils");
global.utils = utils;
const log = require("./src/logger");
const { loadConfig, checkCredentialsStatus } = require("./src/config");
const { createBot } = require("./src/bot");
const { createStatusServer } = require("./src/statusServer");

const BANNER = [
	"  ██╗███╗   ██╗███████╗████████╗ █████╗ ██████╗  ██████╗ ████████╗",
	"  ██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝",
	"  ██║██╔██╗ ██║███████╗   ██║   ███████║██████╔╝██║   ██║   ██║   ",
	"  ██║██║╚██╗██║╚════██║   ██║   ██╔══██║██╔══██╗██║   ██║   ██║   ",
	"  ██║██║ ╚████║███████║   ██║   ██║  ██║██████╔╝╚██████╔╝   ██║   ",
	"  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝   "
];

function printBanner() {
	const version = require("./package.json").version;
	log.plain("");
	for (const line of BANNER) log.plain(log.paint("magenta", line));
	log.plain("");
	log.plain(log.paint("cyan", ` InstaBOT v${version} — Advanced High-Performance Instagram Automation Framework`));
	log.plain(log.paint("dim", ` • Developer: frnAlt (https://github.com/frnAlt)`));
	log.plain(log.paint("dim", ` • Original Base & ICA Engine: Saifullah Al Neoaz (@lazyneoaz)`));
	log.plain(log.paint("dim", ` • Ecosystem: Floppa-Chatbot / GoatBot V2 Architecture`));
	log.plain(log.paint("dim", ` • Official Repository: https://github.com/frnAlt/InstaBOT`));
	log.plain("");
}

async function main() {
	printBanner();

	let config;
	try {
		config = loadConfig();
	}
	catch (error) {
		log.error("CONFIG", error.message);
		process.exit(1);
	}

	const mem = process.memoryUsage();
	const memRss = (mem.rss / 1024 / 1024).toFixed(1);
	const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(1);
	const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);

	log.box("SYSTEM TELEMETRY", [
		`Node.js:      ${process.version} (${process.arch})`,
		`Platform:     ${process.platform}`,
		`Process PID:  ${process.pid}`,
		`Memory RSS:   ${memRss} MB (Heap: ${heapUsed} / ${heapTotal} MB)`,
		`Prefix:       ${config.prefix || "*"}`,
		`Environment:  ${process.env.NODE_ENV || "development"}`
	], "cyan");

	const credStatus = checkCredentialsStatus();
	if (credStatus.ok) {
		log.box("INSTAGRAM AUTHENTICATION: READY", [
			`Mode:         ${credStatus.mode}`,
			`Source:       ${credStatus.source}`,
			`Cookies:      ${credStatus.cookiesCount ? credStatus.cookiesCount + " verified" : "Configured"}`,
			`Account ID:   ${credStatus.userID || "Configured"}`
		], "green");
	} else {
		log.box("INSTAGRAM AUTHENTICATION: CREDENTIALS REQUIRED", [
			`Status:       LOGIN FAILED / CREDENTIALS REQUIRED`,
			`Reason:       ${credStatus.reason || "Missing cookies"}`,
			`Source:       ${credStatus.source || "none"}`,
			`────────────────────────────────────────────────────────────────────`,
			`DIAGNOSTIC & QUICK SETUP GUIDE:`,
			``,
			`1. LOCAL HOSTING:`,
			`   • Copy account.example.txt to account.txt`,
			`   • Paste your Instagram cookies (JSON array or cookie string)`,
			`   • Required cookies: 'sessionid' and 'ds_user_id'`,
			``,
			`2. GITHUB ACTIONS / CI RUNNER:`,
			`   • Repository Settings -> Secrets and variables -> Actions`,
			`   • Add Secret named: ACCOUNT_TXT (or IG_COOKIES)`,
			`   • Paste your account.txt contents into the secret`,
			`   • Run workflow manually from the Actions tab`,
			``,
			`3. SERVER BRIDGE MODE (Mode A):`,
			`   • Set server.url & server.token in config.json or environment`,
			`     variables (IG_API_SERVER and IG_API_TOKEN)`
		], "red");

		if (process.env.GITHUB_ACTIONS === "true") {
			log.error("BOOT", "Workflow runner halted: No Instagram credentials configured in repository secrets (ACCOUNT_TXT / IG_COOKIES / IG_API_SERVER). Please configure secrets and re-run.");
			process.exit(1);
		}
	}

	const bot = createBot(config);

	// A host like Render scans for an open port and marks a service that binds
	// none as unhealthy. This tiny server satisfies that check and serves
	// /health. Set PORT=0 to disable it (pure worker mode).
	const statusServer = createStatusServer({
		info: () => ({
			bot: config.botName,
			botId: config.server && config.server.botId ? config.server.botId : "default",
			online: bot.state.running === true,
			userID: bot.state.botID || null,
			commands: bot.state.commandCount,
			events: bot.state.eventCount
		})
	});

	const shutdown = async (signal) => {
		log.warn("SYSTEM", `Received ${signal}; shutting down…`);
		await statusServer.stop();
		await bot.stop();
		process.exit(0);
	};
	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));

	process.on("unhandledRejection", (reason) => log.error("PROCESS", "Unhandled promise rejection", reason));
	process.on("uncaughtException", (error) => log.error("PROCESS", "Uncaught exception", error));

	try {
		await statusServer.start();
	}
	catch (error) {
		log.error("HTTP", "Could not start the status server", error);
	}

	try {
		await bot.start();
	}
	catch (error) {
		// start() already retries; this is only a last-resort guard. Keep the
		// process alive so the host does not fail the deploy and a later fix is
		// picked up without a redeploy.
		log.error("BOOT", "Failed to start (will keep the process alive)", error);
		await new Promise(() => { });
	}
}

if (require.main === module) {
	main();
}

module.exports = {
	main,
	createBot,
	loadConfig,
	...require("./platforms/instagram")
};
