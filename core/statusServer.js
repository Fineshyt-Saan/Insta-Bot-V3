"use strict";

/**
 * core/statusServer.js
 *
 * Express-free HTTP server serving:
 * - /health endpoint for deployment health checks.
 * - Web dashboard at / and /dashboard.
 * - JSON API routes (/api/status, /api/commands, /api/debug).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

function createStatusServer(bot) {
	const config = bot.config;
	let port = parseInt(process.env.PORT || config.DASHBOARD_PORT || 3000, 10);
	if (port === 0) {
		return { start: () => Promise.resolve(), stop: () => Promise.resolve() };
	}

	const dashboardHtmlPath = path.resolve(process.cwd(), "dashboard", "index.html");

	const server = http.createServer(async (req, res) => {
		const url = req.url.split("?")[0];

		// 1. Health check endpoint
		if (url === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			return res.end(JSON.stringify({
				status: "ok",
				online: bot.client ? bot.client.isRunning : false,
				uptime: Math.floor(process.uptime())
			}));
		}

		// 2. Dashboard HTML
		if (url === "/" || url === "/dashboard") {
			if (fs.existsSync(dashboardHtmlPath)) {
				try {
					const html = fs.readFileSync(dashboardHtmlPath, "utf-8");
					res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
					return res.end(html);
				} catch (err) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					return res.end(`Dashboard error: ${err.message}`);
				}
			} else {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				return res.end(`
					<!DOCTYPE html>
					<html>
					<head><title>${config.BOT_NAME || "InstaBOT"} Status</title></head>
					<body style="font-family:sans-serif;padding:2rem;background:#111;color:#eee">
						<h1>🤖 ${config.BOT_NAME || "InstaBOT"} is Running</h1>
						<p>Status: <strong>${bot.client ? bot.client.connectionStatus : "offline"}</strong></p>
						<p>Uptime: ${Math.floor(process.uptime())}s</p>
						<p>Commands: ${bot.commandLoader ? bot.commandLoader.commands.size : 0}</p>
					</body>
					</html>
				`);
			}
		}

		// 3. API Routes
		const json = (data) => {
			res.writeHead(200, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*"
			});
			res.end(JSON.stringify(data));
		};

		if (url === "/api/status") {
			return json({
				bot: config.BOT_NAME || "InstaBOT",
				online: bot.client ? bot.client.isRunning : false,
				status: bot.client ? bot.client.connectionStatus : "offline",
				userID: bot.client ? bot.client.userID : null,
				commands: bot.commandLoader ? bot.commandLoader.commands.size : 0,
				uptime: Math.floor(process.uptime()),
				memory: process.memoryUsage()
			});
		}

		if (url === "/api/commands") {
			const list = bot.commandLoader ? bot.commandLoader.getAllCommandNames() : [];
			return json({ commands: list, total: list.length });
		}

		if (url === "/api/debug") {
			return json({
				node: process.version,
				platform: process.platform,
				uptime: Math.floor(process.uptime()),
				memory: process.memoryUsage(),
				activeOnReply: global.GoatBot?.onReply ? global.GoatBot.onReply.size : 0,
				activeOnReaction: global.GoatBot?.onReaction ? global.GoatBot.onReaction.size : 0
			});
		}

		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
	});

	return {
		start: () => new Promise((resolve) => {
			server.listen(port, "0.0.0.0", () => {
				logger.info(`Status & Dashboard server running on port ${port} (http://localhost:${port}/)`);
				resolve(server);
			});
			server.on("error", (err) => {
				if (err.code === "EADDRINUSE") {
					logger.warn(`Port ${port} in use, trying ${port + 1}...`);
					port++;
					server.listen(port, "0.0.0.0", () => resolve(server));
				} else {
					logger.error("Status server error", { error: err.message });
					resolve(server);
				}
			});
		}),
		stop: () => new Promise((resolve) => {
			server.close(() => resolve());
		})
	};
}

module.exports = { createStatusServer };
