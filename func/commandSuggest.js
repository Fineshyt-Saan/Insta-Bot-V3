/**
 * Command Suggestion Utility — "Did You Mean?" Dice's Coefficient (bigram matcher)
 */

function compareTwoStrings(first, second) {
	const f = first.replace(/\s+/g, '');
	const s = second.replace(/\s+/g, '');

	if (f === s) return 1;
	if (f.length < 2 || s.length < 2) return 0;

	const firstBigrams = new Map();
	for (let i = 0; i < f.length - 1; i++) {
		const bigram = f.substring(i, i + 2);
		firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
	}

	let intersectionSize = 0;
	for (let i = 0; i < s.length - 1; i++) {
		const bigram = s.substring(i, i + 2);
		const count = firstBigrams.get(bigram) || 0;

		if (count > 0) {
			firstBigrams.set(bigram, count - 1);
			intersectionSize++;
		}
	}

	return (2.0 * intersectionSize) / (f.length + s.length - 2);
}

function findSimilarCommand(unknown, commandsMap) {
	if (!unknown || !commandsMap) return null;
	const targetCmd = String(unknown).toLowerCase().trim();
	const seen = new Set();
	const ratings = [];

	// Normalize commands collection into an iterable of [key, value]
	let entries = [];
	if (commandsMap instanceof Map) {
		entries = Array.from(commandsMap.entries());
	} else if (Array.isArray(commandsMap)) {
		entries = commandsMap.map(item => [typeof item === 'string' ? item : item?.config?.name, item]);
	} else if (typeof commandsMap === 'object') {
		entries = Object.entries(commandsMap);
	}

	for (const [cmdName, mod] of entries) {
		const rawName = (typeof mod === 'string' ? mod : (mod?.config?.name || cmdName));
		if (!rawName) continue;
		const canonical = String(rawName).toLowerCase();
		if (seen.has(canonical)) continue;
		seen.add(canonical);

		const score = compareTwoStrings(targetCmd, canonical);
		ratings.push({ target: canonical, rating: score });

		if (mod && typeof mod === 'object' && mod.config?.aliases && Array.isArray(mod.config.aliases)) {
			for (const alias of mod.config.aliases) {
				if (!alias) continue;
				const aliasScore = compareTwoStrings(targetCmd, String(alias).toLowerCase());
				ratings.push({ target: canonical, rating: aliasScore });
			}
		}
	}

	ratings.sort((a, b) => b.rating - a.rating);

	const MIN_THRESHOLD = 0.35;
	if (ratings.length > 0 && ratings[0].rating >= MIN_THRESHOLD) {
		return ratings[0].target;
	}

	return null;
}

module.exports = {
	findSimilarCommand,
	compareTwoStrings
};
