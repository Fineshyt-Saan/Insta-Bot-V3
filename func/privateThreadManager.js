/**
 * @author frnAlt / Gtajisan (Farhan Muh Tasim)
 * ! Floppa Private DM Thread Manager
 * ! Solves Facebook Messenger E2EE (1545116 / cutoverHandleInvalidSendToOpen) by providing
 * ! dedicated 2-person unencrypted private rooms for direct messaging.
 */

"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA_FILE = path.join(process.cwd(), "database/data/private_dm_threads.json");

class PrivateThreadManager {
  constructor() {
    this.threadsMap = new Map();
    this.inFlightCreations = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readJsonSync(DATA_FILE);
        if (raw && typeof raw === "object") {
          for (const [uid, tid] of Object.entries(raw)) {
            if (uid && tid) {
              this.threadsMap.set(String(uid), String(tid));
            }
          }
        }
      }
    } catch (err) {
      console.error("[PRIVATE_DM] Failed to load private threads store:", err.message);
    }
  }

  save() {
    try {
      const obj = {};
      for (const [uid, tid] of this.threadsMap.entries()) {
        obj[uid] = tid;
      }
      fs.writeJsonSync(DATA_FILE, obj, { spaces: 2 });
    } catch (err) {
      console.error("[PRIVATE_DM] Failed to save private threads store:", err.message);
    }
  }

  getPrivateThread(senderUID) {
    if (!senderUID) return null;
    const uid = String(senderUID);

    // 1. Direct in-memory lookup
    if (this.threadsMap.has(uid)) {
      return this.threadsMap.get(uid);
    }

    // 2. Discover from existing threads in global.db.allThreadData
    if (global.db && Array.isArray(global.db.allThreadData)) {
      const botID = String(global.botID || global.GoatBot?.botID || "");
      const found = global.db.allThreadData.find(t => {
        if (!t || !t.isGroup || !Array.isArray(t.members)) return false;
        const memberUIDs = t.members.map(m => String(m.userID || m.id || m));
        const hasUser = memberUIDs.includes(uid);
        const isTwoPerson = memberUIDs.length === 2 && (!botID || memberUIDs.includes(botID));
        const isFloppaPrivate = t.threadName && t.threadName.toLowerCase().startsWith("floppa private");
        return hasUser && (isTwoPerson || isFloppaPrivate);
      });

      if (found && found.threadID) {
        const tid = String(found.threadID);
        this.threadsMap.set(uid, tid);
        this.save();
        return tid;
      }
    }

    return null;
  }

  registerPrivateThread(senderUID, threadID) {
    if (!senderUID || !threadID) return;
    this.threadsMap.set(String(senderUID), String(threadID));
    this.save();
  }

  async getOrCreatePrivateThread(api, senderUID, userName = "") {
    if (!senderUID) return null;
    const uid = String(senderUID);

    // Check if already known
    const existing = this.getPrivateThread(uid);
    if (existing) {
      return existing;
    }

    // Deduplicate concurrent creation requests for the same user
    if (this.inFlightCreations.has(uid)) {
      return await this.inFlightCreations.get(uid);
    }

    const creationPromise = (async () => {
      try {
        if (!api || typeof api.createNewGroup !== "function") {
          return null;
        }

        const myID = String(api.getCurrentUserID?.() || global.botID || "");
        if (uid === myID) {
          return null;
        }

        const title = "Floppa Private: " + (userName ? userName.trim() : `User ${uid}`);
        const newThreadID = await api.createNewGroup([uid], title);

        if (newThreadID) {
          const tid = String(newThreadID);
          this.threadsMap.set(uid, tid);
          this.save();

          // Pre-populate global.db so controllers know about this new thread immediately
          if (global.db && Array.isArray(global.db.allThreadData)) {
            const alreadyInDB = global.db.allThreadData.some(t => String(t.threadID) === tid);
            if (!alreadyInDB) {
              global.db.allThreadData.push({
                threadID: tid,
                threadName: title,
                adminIDs: [myID],
                members: [
                  { userID: myID, inGroup: true, permissionConfigDashboard: true },
                  { userID: uid, inGroup: true, permissionConfigDashboard: false }
                ],
                settings: {},
                data: {},
                isGroup: true
              });
            }
          }

          return tid;
        }
      } catch (err) {
        console.error(`[PRIVATE_DM] Failed to create private thread for ${uid}:`, err.message || err);
      } finally {
        this.inFlightCreations.delete(uid);
      }
      return null;
    })();

    this.inFlightCreations.set(uid, creationPromise);
    return await creationPromise;
  }

  getAllPrivateThreads() {
    const list = [];
    for (const [uid, tid] of this.threadsMap.entries()) {
      const uObj = (global.db?.allUserData || []).find(u => String(u.userID) === uid);
      const tObj = (global.db?.allThreadData || []).find(t => String(t.threadID) === tid);
      list.push({
        userID: uid,
        threadID: tid,
        userName: uObj?.name || `User ${uid}`,
        threadName: tObj?.threadName || "Floppa Private Chat",
        memberCount: tObj?.members?.length || 2
      });
    }
    return list;
  }

  clearPrivateThread(senderUID) {
    if (!senderUID) return false;
    const uid = String(senderUID);
    const deleted = this.threadsMap.delete(uid);
    if (deleted) this.save();
    return deleted;
  }

  async sendDM(api, targetUID, messagePayload, options = {}) {
    if (!api || !targetUID) throw new Error("sendDM requires api and targetUID");
    const uid = String(targetUID);
    const uObj = (global.db?.allUserData || []).find(u => String(u.userID) === uid);
    const uName = uObj?.name || `User ${uid}`;
    const cb = typeof options.callback === "function" ? options.callback : undefined;
    const replyTo = options.replyToMessageID || options.replyTo || undefined;

    // 1. Check if user already has a private thread
    const knownPrivateTID = this.getPrivateThread(uid);
    if (knownPrivateTID) {
      try {
        const res = await api.sendMessage(messagePayload, knownPrivateTID, cb, replyTo, true);
        return { ...(typeof res === "object" ? res : {}), messageID: res?.messageID, threadID: knownPrivateTID, recipientUID: uid, recipientName: uName, deliveryMethod: "private_room" };
      } catch (privErr) {
        console.warn(`[PRIVATE_DM] Failed sending to cached private room ${knownPrivateTID}:`, privErr.message);
      }
    }

    // 2. Try sending direct 1-on-1 DM
    try {
      const res = await api.sendMessage(messagePayload, uid, cb, replyTo, false);
      return { ...(typeof res === "object" ? res : {}), messageID: res?.messageID, threadID: uid, recipientUID: uid, recipientName: uName, deliveryMethod: "direct" };
    } catch (dmErr) {
      const errStr = String(dmErr?.message || dmErr || "");
      if (errStr.includes("1545116") || errStr.includes("E2EE") || errStr.includes("cutover") || errStr.includes("1545041")) {
        // 3. Create or fetch private room
        const newTID = await this.getOrCreatePrivateThread(api, uid, uName);
        if (newTID && String(newTID) !== uid) {
          const res = await api.sendMessage(messagePayload, newTID, cb, replyTo, true);
          return { ...(typeof res === "object" ? res : {}), messageID: res?.messageID, threadID: newTID, recipientUID: uid, recipientName: uName, deliveryMethod: "private_room_created" };
        }

        // 4. Fallback to shared active group chat
        const sharedGroup = (global.db?.allThreadData || []).find(t =>
          t.isGroup && t.members && t.members.some(m => String(m.userID || m.id || m) === uid)
        );
        if (sharedGroup) {
          const textContent = typeof messagePayload === "string" ? messagePayload : (messagePayload?.body || "");
          const bridgeMsg = typeof messagePayload === "object" ? { ...messagePayload } : {};
          bridgeMsg.body = `💬 [DM Bridge for ${uName}]:\n\n${textContent}\n\nℹ️ (Facebook E2EE restricts 1-on-1 private bot messages; bridged to your active group chat)`;
          const res = await api.sendMessage(bridgeMsg, sharedGroup.threadID, cb, replyTo, true);
          return { ...(typeof res === "object" ? res : {}), messageID: res?.messageID, threadID: sharedGroup.threadID, recipientUID: uid, recipientName: uName, deliveryMethod: "group_bridge" };
        }
      }
      if (typeof cb === "function") cb(dmErr);
      throw dmErr;
    }
  }

  async broadcastDM(api, messagePayload, delayMs = 1200) {
    const targets = this.getAllPrivateThreads();
    const results = {
      total: targets.length,
      sent: 0,
      failed: 0,
      details: []
    };

    for (const target of targets) {
      try {
        await api.sendMessage(messagePayload, target.threadID, undefined, undefined, true);
        results.sent++;
        results.details.push({ userID: target.userID, threadID: target.threadID, status: "SUCCESS" });
      } catch (err) {
        results.failed++;
        results.details.push({ userID: target.userID, threadID: target.threadID, status: "FAILED", error: err.message });
      }
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return results;
  }
}

const privateThreadManager = new PrivateThreadManager();

// Seed known verified private thread for Farhan Muh Tasim (100094924471568)
privateThreadManager.registerPrivateThread("100094924471568", "1089640446736327");

global.privateThreadManager = privateThreadManager;

module.exports = privateThreadManager;
