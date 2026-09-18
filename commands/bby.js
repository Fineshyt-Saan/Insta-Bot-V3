"use strict";

/**
 * Native InstaBOT port of dipto's Goat-Bot-V2 baby command.
 * Source: https://raw.githubusercontent.com/dipto-69008/Goat-Bot-V2/refs/heads/main/scripts/cmds/baby.js
 */

const API_BASE = "https://noobs-api.top/dipto";
const API_PATH = "/baby";

async function request(params = {}) {
	const url = new URL(`${API_BASE}${API_PATH}`);
	for (const [key, value] of Object.entries(params)) {
		if (value != null && String(value) !== "") url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, {
		headers: { Accept: "application/json", "User-Agent": "InstaBOT" }
	});
	let data = {};
	try { data = await response.json(); }
	catch (_) { /* report the HTTP status below */ }
	if (!response.ok) {
		const detail = data && (data.error || data.message) ? `: ${data.error || data.message}` : "";
		throw new Error(`baby API returned HTTP ${response.status}${detail}`);
	}
	return data || {};
}

function textOf(data, fallback = "The baby API returned no reply.") {
	const value = data && (data.reply != null ? data.reply : data.message != null ? data.message : data.data);
	return value == null ? fallback : String(value);
}

function userName(usersData, userID) {
	try {
		const user = usersData && typeof usersData.get === "function" ? usersData.get(userID) : null;
		return (user && (user.name || user.username)) || String(userID);
	}
	catch (_) {
		return String(userID);
	}
}

async function answer(event, value) {
	const data = await request({ text: String(value).toLowerCase(), senderID: event.senderID, font: 1 });
	return textOf(data);
}

function armReply(setReplyHandler, sent) {
	if (typeof setReplyHandler !== "function" || !sent || !sent.messageID) return;
	setReplyHandler(async ({ api, message, event, setReplyHandler: nextSetReplyHandler }) => {
		if (event.type && event.type !== "message_reply") return;
		try {
			const selfID = api && typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : null;
			if (selfID && String(selfID) === String(event.senderID)) return;
			const body = typeof event.body === "string" ? event.body.trim() : "";
			if (!body) return message.reply("Say something to bby.");
			const next = await message.reply(await answer(event, body));
			armReply(nextSetReplyHandler || setReplyHandler, next);
			return next;
		}
		catch (error) {
			return message.reply(`Error: ${error.message || error}`);
		}
	}, sent.messageID);
}

async function replyAndArm(message, text, setReplyHandler) {
	const sent = await message.reply(text);
	armReply(setReplyHandler, sent);
	return sent;
}

async function specialReply(args, event, usersData) {
	const raw = args.join(" ").trim();
	const lower = raw.toLowerCase();
	const senderID = event.senderID;

	if (lower.startsWith("remove ")) {
		const key = raw.slice("remove ".length).trim();
		if (!key) return "Usage: bby remove <message>";
		return textOf(await request({ remove: key, senderID }));
	}

	if (lower.startsWith("rm ")) {
		const parts = raw.slice(3).split(/\s*-\s*/).map(part => part.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Usage: bby rm <message> - <index>";
		return textOf(await request({ remove: parts[0], index: parts[1] }));
	}

	if (lower === "list") {
		const data = await request({ list: "all" });
		const teachers = data && data.teacher && Array.isArray(data.teacher.teacherList) ? data.teacher.teacherList : [];
		return `Total Teach = ${teachers.length}\nTotal Response = ${data.responseLength || "api off"}`;
	}

	if (lower.startsWith("list all")) {
		const parts = raw.split(/\s+/);
		const limit = Math.min(100, Math.max(1, Number(parts[2]) || 100));
		const data = await request({ list: "all" });
		const list = data && data.teacher && Array.isArray(data.teacher.teacherList) ? data.teacher.teacherList : [];
		const output = list.slice(0, limit).map((item, index) => {
			const id = Object.keys(item || {})[0];
			return `${index + 1}/ ${userName(usersData, id)}: ${id ? item[id] : 0}`;
		}).join("\n");
		return `List of Teachers of baby\n${output || "No teachers found."}`;
	}

	if (lower.startsWith("msg ")) {
		const key = raw.slice(4).trim();
		if (!key) return "Usage: bby msg <message>";
		return `Message ${key} = ${textOf(await request({ list: key }), "Not found")}`;
	}

	if (lower.startsWith("edit ")) {
		const parts = raw.slice(5).split(/\s*-\s*/).map(part => part.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Use: bby edit <message> - <new reply>";
		return `changed ${textOf(await request({ edit: parts[0], replace: parts[1], senderID }))}`;
	}

	if (lower.startsWith("teach react ")) {
		const parts = raw.slice("teach react".length).split(/\s*-\s*/).map(part => part.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Use: bby teach react <message> - <reaction>";
		return `Replies added ${textOf(await request({ teach: parts[0], react: parts[1] }))}`;
	}

	if (lower.startsWith("teach amar ")) {
		const parts = raw.slice("teach amar".length).split(/\s*-\s*/).map(part => part.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Use: bby teach amar <message> - <reply>";
		return `Replies added ${textOf(await request({ teach: parts[0], reply: parts[1], key: "intro" }))}`;
	}

	if (lower.startsWith("teach ")) {
		const parts = raw.slice(6).split(/\s*-\s*/).map(part => part.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Use: bby teach <message> - <reply>";
		const data = await request({ teach: parts[0], reply: parts[1], senderID, threadID: event.threadID });
		return `Replies added ${textOf(data)}\nTeacher: ${userName(usersData, senderID)}\nTeachs: ${data.teachs || "-"}`;
	}

	if (["amar name ki", "amr nam ki", "amar nam ki", "amr name ki", "whats my name"].includes(lower))
		return textOf(await request({ text: "amar name ki", senderID, key: "intro" }));

	return null;
}

module.exports = {
	config: {
		name: "bby",
		aliases: ["baby", "bbe", "babe", "sam"],
		author: "dipto",
		cooldown: 0,
		role: 0,
		noPrefix: true,
		noPrefixRole: 0,
		category: "chat",
		description: { en: "Chat with baby and teach custom replies" },
		usage: { en: "{p}bby <message> | {p}bby teach <message> - <reply> | {p}bby list" }
	},

	onStart: async function ({ message, args, event, usersData, setReplyHandler }) {
		try {
			if (!args.length) return replyAndArm(message, "Bolo baby", setReplyHandler);
			const special = await specialReply(args, event, usersData);
			if (special != null) return message.reply(special);
			return replyAndArm(message, await answer(event, args.join(" ")), setReplyHandler);
		}
		catch (error) {
			return message.reply(`Error: ${error.message || error}`);
		}
	}
};
