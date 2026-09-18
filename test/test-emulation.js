"use strict";

const assert = require("assert");
const path = require("path");
const { BrowserSession } = require("../platforms/instagram/emulation/browserSession");
const { GraphQLClient } = require("../platforms/instagram/emulation/graphQLClient");
const { UserSessionEmulation, createMessengerBot, createInstagramBot, login } = require("../platforms/instagram/emulation");
const instagram = require("../platforms/instagram");
const rootIndex = require("../index");

async function runEmulationTests() {
	console.log("╔═══════════════════════════════════════════════════════════╗");
	console.log("║      User-Session Emulation & Protocol Verification       ║");
	console.log("╚═══════════════════════════════════════════════════════════╝\n");

	let passed = 0;
	let failed = 0;

	async function test(name, fn) {
		process.stdout.write(`  ▶ ${name} ... `);
		try {
			await fn();
			console.log("✔ PASS");
			passed++;
		} catch (err) {
			console.log("✖ FAIL");
			console.error(`    Error: ${err.message}`);
			if (err.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
			failed++;
		}
	}

	// ── 1. BrowserSession & Fingerprint ──
	await test("BrowserSession Cookie Parsing & Header Emulation", async () => {
		const mockCookies = [
			{ name: "sessionid", value: "test_session_123", domain: ".instagram.com", path: "/" },
			{ name: "ds_user_id", value: "987654321", domain: ".instagram.com", path: "/" },
			{ name: "csrftoken", value: "csrf_token_abc", domain: ".instagram.com", path: "/" },
			{ name: "ig_did", value: "did_uuid_xyz", domain: ".instagram.com", path: "/" }
		];

		const session = new BrowserSession({ cookies: mockCookies });
		assert.strictEqual(session.userId, "987654321");
		assert.strictEqual(session.sessionId, "test_session_123");
		assert.strictEqual(session.csrfToken, "csrf_token_abc");

		const headers = session.getBrowserHeaders();
		assert.strictEqual(headers["X-IG-App-ID"], "936619743392459");
		assert.strictEqual(headers["X-ASBD-ID"], "129477");
		assert.strictEqual(headers["X-CSRFToken"], "csrf_token_abc");
		assert.strictEqual(headers["X-IG-D"], "did_uuid_xyz");
		assert.strictEqual(headers["sec-ch-ua-platform"], '"Windows"');
		assert.strictEqual(headers["Sec-Fetch-Site"], "same-origin");
		assert.strictEqual(headers["Sec-Fetch-Mode"], "cors");
		assert.strictEqual(headers["Sec-Fetch-Dest"], "empty");
		assert(headers["Cookie"].includes("sessionid=test_session_123"));
		assert(headers["Cookie"].includes("ds_user_id=987654321"));

		const wsHeaders = session.getMqttWsHeaders();
		assert.strictEqual(wsHeaders["Sec-WebSocket-Version"], "13");
		assert.strictEqual(wsHeaders["Sec-Fetch-Dest"], "websocket");
		assert.strictEqual(wsHeaders["X-ASBD-ID"], "129477");
		assert(wsHeaders["Cookie"].includes("sessionid=test_session_123"));

		const exportedAppState = session.exportAppState();
		assert(Array.isArray(exportedAppState));
		assert(exportedAppState.some(c => c.key === "sessionid" && c.value === "test_session_123"));
	});

	// ── 2. GraphQL & Web Direct Payload Formatting ──
	await test("GraphQLClient Request & Payload Generation", async () => {
		const session = new BrowserSession({
			cookies: "sessionid=sess_1; ds_user_id=user_1; csrftoken=csrf_1;"
		});
		const client = new GraphQLClient(session);

		let intercepted = null;
		client.http.request = async (config) => {
			intercepted = config;
			return {
				data: { payload: { item_id: "msg_item_99" } },
				headers: { "x-ig-set-www-claim": "claim_token_123" }
			};
		};

		// Test broadcastText
		const result = await client.broadcastText("th_123", "Hello world", "reply_target_456");
		assert.strictEqual(result.messageID, "msg_item_99");
		assert.strictEqual(result.threadID, "th_123");
		assert(intercepted.data.includes("Hello+world") || intercepted.data.includes("Hello world") || intercepted.data.includes("Hello%20world"));
		assert(intercepted.data.includes("reply_target_456"));
		assert(intercepted.headers["X-ASBD-ID"] === "129477");
		assert.strictEqual(session.wwwClaim, "claim_token_123");

		// Test broadcastReaction
		await client.broadcastReaction("th_123", "msg_item_99", "❤️");
		assert(intercepted.data.includes("action=send_item"));
		assert(intercepted.data.includes("reaction_type=like"));
		assert(intercepted.data.includes("emoji=%E2%9D%A4%EF%B8%8F") || intercepted.data.includes("emoji="));

		// Test unsendMessage
		await client.unsendMessage("th_123", "msg_item_99");
		assert(intercepted.url.includes("/api/v1/direct_v2/threads/th_123/items/msg_item_99/delete/"));

		// Test typing indicators
		await client.sendTypingIndicator("th_123");
		assert(intercepted.data.includes("activity_status=1"));
		await client.stopTypingIndicator("th_123");
		assert(intercepted.data.includes("activity_status=0"));
	});

	// ── 3. UserSessionEmulation Programmatic & Bot API ──
	await test("UserSessionEmulation Flat API & Event-Driven Routing", async () => {
		const session = new UserSessionEmulation({
			appState: [
				{ name: "sessionid", value: "sess_bot", domain: ".instagram.com" },
				{ name: "ds_user_id", value: "bot_123", domain: ".instagram.com" }
			]
		}, { commandPrefix: "/" });

		assert.strictEqual(session.getCurrentUserID(), "bot_123");
		assert(session.getAppState().some(c => c.key === "sessionid"));

		const sent = [];
		session.graphQLClient.broadcastText = async (tid, text, replyTo) => {
			sent.push({ tid, text, replyTo });
			return { messageID: "mid_" + sent.length, threadID: tid };
		};
		session.graphQLClient.broadcastReaction = async (tid, mid, emoji) => {
			sent.push({ tid, mid, emoji });
			return { success: true };
		};

		// 1. Flat API: sendMessage
		const msgRes = await session.sendMessage("Test flat send", "th_555");
		assert.strictEqual(msgRes.threadID, "th_555");
		assert.strictEqual(sent[0].text, "Test flat send");

		// 2. Flat API: replyToMessage
		await session.replyToMessage("th_555", "Replying", "mid_1");
		assert.strictEqual(sent[1].replyTo, "mid_1");

		// 3. Command registration & dispatch
		let commandExecuted = false;
		session.command("ping", async (ctx) => {
			commandExecuted = true;
			assert.strictEqual(ctx.threadID, "th_555");
			assert.strictEqual(ctx.args[0], "arg1");
			await ctx.replyAsync("pong");
		});

		session._routeEvent({
			type: "message",
			threadID: "th_555",
			senderID: "usr_999",
			messageID: "cmd_msg_1",
			body: "/ping arg1"
		});

		assert(commandExecuted, "Registered command handler should have executed");
		assert(sent.some(s => s.text === "pong" && s.replyTo === "cmd_msg_1"));
	});

	// ── 4. Unified Module Exports & Architecture Integration ──
	await test("Architecture Re-exports & Factory Functions", async () => {
		assert(typeof instagram.createMessengerBot === "function", "instagram.createMessengerBot must be exported");
		assert(typeof instagram.createInstagramBot === "function", "instagram.createInstagramBot must be exported");
		assert(typeof instagram.UserSessionEmulation === "function", "instagram.UserSessionEmulation must be exported");
		assert(typeof rootIndex.createMessengerBot === "function", "rootIndex.createMessengerBot must be exported");

		// Test getICA with mode: 'emulation'
		const icaEmulation = instagram.getICA({ mode: "emulation" });
		assert.strictEqual(icaEmulation.mode, "emulation");
		assert(typeof icaEmulation.login === "function");
	});

	console.log("\n───────────────────────────────────────────────────────────");
	console.log(`Results: ${passed} passed, ${failed} failed.`);
	console.log("───────────────────────────────────────────────────────────\n");

	if (failed > 0) {
		process.exit(1);
	}
}

runEmulationTests().catch(err => {
	console.error("Fatal test error:", err);
	process.exit(1);
});
