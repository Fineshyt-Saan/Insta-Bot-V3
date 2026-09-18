module.exports = {
	config: {
		name: "kick",
		version: "1.3",
		author: "𝐒𝐈𝐀𝐌 𝐀𝐇𝐌𝐄𝐃 𝐒𝐀𝐀𝐍",
		countDown: 5,
		role: 1,
		description: {
			vi: "Kick thành viên khỏi box chat",
			en: "Kick member out of chat box"
		},
		category: "box chat",
		guide: {
			vi: "   {pn} @tags: dùng để kick những người được tag",
			en: "   {pn} @tags: use to kick members who are tagged"
		}
	},

	langs: {
		vi: {
			needAdmin: "Vui lòng thêm quản trị viên cho bot trước khi sử dụng tính năng này"
		},
		en: {
			needAdmin: "Please add admin for bot before using this feature"
		}
	},

	onStart: async function ({ message, event, args, threadsData, api, getLang }) {
		const rawAdmins = (threadsData && typeof threadsData.get === "function" ? await threadsData.get(event.threadID, "adminIDs") : null) || [];
		const adminIDs = (Array.isArray(rawAdmins) ? rawAdmins : []).map(a => typeof a === "object" ? String(a.id || a.userID || a.pk || a.uid || "") : String(a)).filter(Boolean);
		const selfID = String(api.getCurrentUserID ? api.getCurrentUserID() : (api._userID || ""));
		if (selfID && adminIDs.length > 0 && !adminIDs.includes(selfID))
			return message.reply(getLang("needAdmin"));

		async function kickAndCheckError(uid) {
			try {
				if (typeof api.removeUserFromGroup === "function") {
					await api.removeUserFromGroup(uid, event.threadID);
				} else if (typeof api.removeUserFromThread === "function") {
					await api.removeUserFromThread(uid, event.threadID);
				}
			}
			catch (e) {
				message.reply(getLang("needAdmin"));
				return "ERROR";
			}
		}
		if (!args[0]) {
			if (!event.messageReply)
				return message.SyntaxError();
			await kickAndCheckError(event.messageReply.senderID);
		}
		else {
			let uids = Object.keys(event.mentions || {});
			if (uids.length === 0) {
				uids = args.filter(a => /^\d+$/.test(a));
			}
			if (uids.length === 0)
				return message.SyntaxError();
			if (await kickAndCheckError(uids.shift()) === "ERROR")
				return;
			for (const uid of uids) {
				if (typeof api.removeUserFromGroup === "function") {
					api.removeUserFromGroup(uid, event.threadID);
				} else if (typeof api.removeUserFromThread === "function") {
					api.removeUserFromThread(uid, event.threadID);
				}
			}
		}
	}
};