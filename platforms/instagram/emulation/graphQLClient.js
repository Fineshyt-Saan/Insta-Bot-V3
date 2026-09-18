"use strict";

/**
 * platforms/instagram/emulation/graphQLClient.js
 *
 * HTTP/GraphQL Protocol Emulation Client:
 * Speaks the exact HTTP and GraphQL protocols that Meta / Instagram Web uses.
 */

const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { HttpsProxyAgent } = require("https-proxy-agent");

class GraphQLClient {
	constructor(browserSession, options = {}) {
		this.session = browserSession;
		this.proxy = options.proxy || null;
		this.timeout = options.timeout || 30000;
		this.baseUrl = "https://www.instagram.com";

		const axiosConfig = {
			jar: this.session.jar,
			timeout: this.timeout,
			withCredentials: true
		};

		if (this.proxy) {
			axiosConfig.httpsAgent = new HttpsProxyAgent(this.proxy);
		}

		this.http = wrapper(axios.create(axiosConfig));
	}

	async request(method, url, data = null, customHeaders = {}) {
		const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
		const headers = this.session.getBrowserHeaders(customHeaders);

		try {
			const res = await this.http.request({
				method,
				url: fullUrl,
				data,
				headers
			});
			if (res.headers["x-ig-set-www-claim"]) {
				this.session.wwwClaim = res.headers["x-ig-set-www-claim"];
			}
			return res.data;
		} catch (err) {
			if (err.response && err.response.headers && err.response.headers["x-ig-set-www-claim"]) {
				this.session.wwwClaim = err.response.headers["x-ig-set-www-claim"];
			}
			const message = err.response?.data?.message || err.response?.data?.error || err.message;
			const error = new Error(`Meta API Error: ${message}`);
			error.status = err.response?.status;
			error.response = err.response?.data;
			throw error;
		}
	}

	async graphQL(docId, variables = {}) {
		const payload = new URLSearchParams();
		payload.append("doc_id", docId);
		payload.append("variables", JSON.stringify(variables));

		return this.request("POST", "/api/graphql", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async graphQLQuery(query, variables = {}) {
		const payload = new URLSearchParams();
		payload.append("query", query);
		payload.append("variables", JSON.stringify(variables));

		return this.request("POST", "/api/graphql", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async broadcastText(threadID, text, replyToMessageID = null) {
		const clientContext = this.session.generateUUID();
		const payload = new URLSearchParams();
		payload.append("action", "send_item");
		payload.append("thread_ids", `[${JSON.stringify(threadID)}]`);
		payload.append("client_context", clientContext);
		payload.append("mutation_token", clientContext);
		payload.append("offline_threading_id", clientContext);
		payload.append("text", String(text));

		if (replyToMessageID) {
			payload.append("replied_to_item_id", String(replyToMessageID));
		}

		const res = await this.request("POST", "/api/v1/direct_v2/threads/broadcast/text/", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});

		const item = res?.payload?.item_id || res?.item_id || clientContext;
		return {
			messageID: String(item),
			threadID: String(threadID),
			timestamp: Date.now(),
			clientContext
		};
	}

	async broadcastReaction(threadID, itemID, emoji) {
		const clientContext = this.session.generateUUID();
		const payload = new URLSearchParams();
		payload.append("action", "send_item");
		payload.append("thread_id", String(threadID));
		payload.append("item_id", String(itemID));
		payload.append("client_context", clientContext);
		payload.append("reaction_type", emoji ? "like" : "unlike");
		payload.append("reaction_status", emoji ? "created" : "deleted");
		if (emoji) payload.append("emoji", emoji);

		return this.request("POST", "/api/v1/direct_v2/threads/broadcast/reaction/", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async unsendMessage(threadID, itemID) {
		const clientContext = this.session.generateUUID();
		const payload = new URLSearchParams();
		payload.append("action", "send_item");
		payload.append("thread_id", String(threadID));
		payload.append("item_id", String(itemID));
		payload.append("client_context", clientContext);

		return this.request("POST", `/api/v1/direct_v2/threads/${threadID}/items/${itemID}/delete/`, payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async sendTypingIndicator(threadID) {
		const payload = new URLSearchParams();
		payload.append("thread_id", String(threadID));
		payload.append("activity_status", "1");
		return this.request("POST", "/api/v1/direct_v2/threads/broadcast/indicate_activity/", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async stopTypingIndicator(threadID) {
		const payload = new URLSearchParams();
		payload.append("thread_id", String(threadID));
		payload.append("activity_status", "0");
		return this.request("POST", "/api/v1/direct_v2/threads/broadcast/indicate_activity/", payload.toString(), {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async markAsRead(threadID) {
		return this.request("POST", `/api/v1/direct_v2/threads/${threadID}/items/seen/`, "", {
			"Content-Type": "application/x-www-form-urlencoded"
		});
	}

	async getInbox(options = {}) {
		const limit = options.limit || 20;
		return this.request("GET", `/api/v1/direct_v2/inbox/?limit=${limit}`);
	}

	async getThreadInfo(threadID) {
		return this.request("GET", `/api/v1/direct_v2/threads/${threadID}/`);
	}

	async getUserInfo(userID) {
		return this.request("GET", `/api/v1/users/${userID}/info/`);
	}

	async getUserInfoByUsername(username) {
		return this.request("GET", `/${username}/?__a=1&__d=dis`);
	}
}

module.exports = { GraphQLClient };
