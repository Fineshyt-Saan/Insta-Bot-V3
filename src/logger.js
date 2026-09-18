"use strict";

/**
 * Small zero-dependency console logger for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const COLORS = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m"
};

function paint(color, text) {
	return `${COLORS[color] || ""}${text}${COLORS.reset}`;
}

function timestamp() {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

let quiet = false;

function write(level, color, tag, message, args) {
	if (quiet) return;
	const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
	stream.write(`${paint("dim", timestamp())} ${paint("magenta", `[${tag}]`)} ${paint(color, message)}\n`);
	for (const item of args) {
		if (item instanceof Error) stream.write(`  ${item.stack || item.message}\n`);
		else stream.write(`  ${typeof item === "string" ? item : JSON.stringify(item, null, 2)}\n`);
	}
}

function box(title, lines, borderColor = "cyan") {
	if (quiet) return;
	const cols = process.stdout.columns || 70;
	const width = Math.min(76, Math.max(48, cols));
	const border = paint(borderColor, "─".repeat(width - 2));
	process.stdout.write(paint(borderColor, `┌${border}┐\n`));
	if (title) {
		const plainTitle = title.replace(/\x1b\[[0-9;]*m/g, "");
		const left = Math.max(0, Math.floor((width - 2 - plainTitle.length - 2) / 2));
		const right = Math.max(0, width - 2 - plainTitle.length - 2 - left);
		process.stdout.write(paint(borderColor, "│") + " ".repeat(left) + " " + title + " " + " ".repeat(right) + paint(borderColor, "│\n"));
		process.stdout.write(paint(borderColor, `├${border}┤\n`));
	}
	for (const line of lines) {
		const plainLine = String(line).replace(/\x1b\[[0-9;]*m/g, "");
		const left = 2;
		const right = Math.max(0, width - 2 - plainLine.length - left);
		process.stdout.write(paint(borderColor, "│") + " ".repeat(left) + line + " ".repeat(right) + paint(borderColor, "│\n"));
	}
	process.stdout.write(paint(borderColor, `└${border}┘\n`));
}

module.exports = {
	info: (tag, message, ...args) => write("info", "cyan", tag, message, args),
	success: (tag, message, ...args) => write("success", "green", tag, message, args),
	warn: (tag, message, ...args) => write("warn", "yellow", tag, message, args),
	error: (tag, message, ...args) => write("error", "red", tag, message, args),
	master: (tag, message, ...args) => write("master", "blue", tag, message, args),
	plain: (message) => { if (!quiet) console.log(message); },
	setQuiet: (value) => { quiet = Boolean(value); },
	box,
	colors: COLORS,
	paint
};
